<?php

declare(strict_types=1);

require_once __DIR__ . '/db.php';

const LIFE_OS_LOGIN_MAX_FAILURES = 5;
const LIFE_OS_LOGIN_WINDOW_SECONDS = 900;

final class LifeOsLoginThrottled extends RuntimeException
{
    public function __construct(public int $retryAfter)
    {
        parent::__construct('Too many sign-in attempts.');
    }
}

/** True when the app sits behind a TLS-terminating proxy the operator trusts. */
function life_os_trust_proxy(): bool
{
    $environment = getenv('LIFEOS_TRUST_PROXY');
    if ($environment !== false) return $environment === 'true';
    try {
        return (life_os_config()['trust_proxy'] ?? false) === true;
    } catch (Throwable) {
        return false;
    }
}

function life_os_is_https(): bool
{
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') return true;
    return life_os_trust_proxy() && strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
}

function life_os_client_ip(): string
{
    if (life_os_trust_proxy()) {
        // The trusted proxy appends the real client address as the last entry.
        $forwarded = array_map('trim', explode(',', (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? '')));
        $last = end($forwarded);
        if (is_string($last) && filter_var($last, FILTER_VALIDATE_IP)) return $last;
    }
    return (string) ($_SERVER['REMOTE_ADDR'] ?? '');
}

function life_os_start_session(): void
{
    if (session_status() === PHP_SESSION_NONE) {
        session_name('edi_life_os');
        session_set_cookie_params([
            'httponly' => true,
            'samesite' => 'Lax',
            'secure' => life_os_is_https(),
        ]);
        session_start();
    }
}

/** Reject state-changing requests that lack this session's CSRF token. */
function life_os_require_csrf(): void
{
    life_os_start_session();
    if (empty($_SESSION['state_csrf']) || !hash_equals((string) $_SESSION['state_csrf'], (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) {
        http_response_code(403);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Invalid request token. Reload the page.'], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

function life_os_username(): string
{
    return (string) life_os_credentials()['username'];
}

function life_os_credentials(): array
{
    $credentials = life_os_db()->query('SELECT username, password_hash FROM app_credentials WHERE credential_id = 1')->fetch();
    if (!is_array($credentials)) {
        throw new RuntimeException('App sign-in credentials are not initialized.');
    }
    return $credentials;
}

function life_os_credential_fingerprint(array $credentials): string
{
    return hash('sha256', $credentials['username'] . "\0" . $credentials['password_hash']);
}

function life_os_is_authenticated(): bool
{
    life_os_start_session();
    if (($_SESSION['life_os_authenticated'] ?? false) !== true) return false;

    try {
        $credentials = life_os_credentials();
        $fingerprint = life_os_credential_fingerprint($credentials);
        $sessionFingerprint = (string) ($_SESSION['life_os_fingerprint'] ?? '');
        if (hash_equals($fingerprint, $sessionFingerprint)) return true;

        // Upgrade sessions created before credentials moved from config.php to MySQL.
        $config = life_os_config();
        $legacyFingerprint = hash('sha256', $config['username'] . "\0" . $config['password']);
        if ($credentials['username'] === $config['username']
            && password_verify($config['password'], $credentials['password_hash'])
            && hash_equals($legacyFingerprint, $sessionFingerprint)) {
            $_SESSION['life_os_username'] = $credentials['username'];
            $_SESSION['life_os_fingerprint'] = $fingerprint;
            return true;
        }
    } catch (Throwable) {
    }
    return false;
}

function life_os_require_auth(): void
{
    if (!life_os_is_authenticated()) {
        $requestUri = (string) ($_SERVER['REQUEST_URI'] ?? '');
        if (str_contains((string) ($_SERVER['HTTP_ACCEPT'] ?? ''), 'application/json') || str_contains($requestUri, '/api.php') || str_contains($requestUri, '/state.php') || str_contains($requestUri, '/credentials.php')) {
            http_response_code(401);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['error' => 'Authentication required.'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $target = (string) ($_SERVER['REQUEST_URI'] ?? '/');
        header('Location: /login.php?redirect=' . rawurlencode($target));
        exit;
    }
}

/** Seconds until this client may try again, or 0 when it is not locked out. */
function life_os_login_retry_after(PDO $db, string $throttleKey): int
{
    $query = $db->prepare('SELECT failures, first_failure_at FROM login_throttle WHERE throttle_key = ?');
    $query->execute([$throttleKey]);
    $row = $query->fetch();
    if (!$row || (int) $row['failures'] < LIFE_OS_LOGIN_MAX_FAILURES) return 0;
    return max(0, (int) $row['first_failure_at'] + LIFE_OS_LOGIN_WINDOW_SECONDS - time());
}

function life_os_record_login_failure(PDO $db, string $throttleKey): void
{
    // A failure after the window has passed starts a new window.
    $now = time();
    $record = $db->prepare('INSERT INTO login_throttle (throttle_key, failures, first_failure_at) VALUES (?, 1, ?)
        ON DUPLICATE KEY UPDATE
            failures = IF(? - first_failure_at >= ?, 1, failures + 1),
            first_failure_at = IF(? - first_failure_at >= ?, ?, first_failure_at)');
    $record->execute([$throttleKey, $now, $now, LIFE_OS_LOGIN_WINDOW_SECONDS, $now, LIFE_OS_LOGIN_WINDOW_SECONDS, $now]);
}

function life_os_login(string $username, string $password): bool
{
    life_os_start_session();
    $db = life_os_db();
    $throttleKey = hash('sha256', life_os_client_ip());
    $retryAfter = life_os_login_retry_after($db, $throttleKey);
    if ($retryAfter > 0) throw new LifeOsLoginThrottled($retryAfter);

    $credentials = life_os_credentials();
    if (!hash_equals((string) $credentials['username'], $username) || !password_verify($password, (string) $credentials['password_hash'])) {
        life_os_record_login_failure($db, $throttleKey);
        return false;
    }

    $db->prepare('DELETE FROM login_throttle WHERE throttle_key = ?')->execute([$throttleKey]);
    session_regenerate_id(true);
    $_SESSION['life_os_authenticated'] = true;
    $_SESSION['life_os_username'] = $username;
    $_SESSION['life_os_fingerprint'] = life_os_credential_fingerprint($credentials);
    return true;
}

function life_os_logout(): void
{
    life_os_start_session();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], (bool) $params['secure'], (bool) $params['httponly']);
    }
    session_destroy();
}
