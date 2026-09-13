<?php

declare(strict_types=1);

require_once __DIR__ . '/db.php';

function life_os_start_session(): void
{
    if (session_status() === PHP_SESSION_NONE) {
        session_name('edi_life_os');
        session_set_cookie_params([
            'httponly' => true,
            'samesite' => 'Lax',
            'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        ]);
        session_start();
    }
}

function life_os_username(): string
{
    return life_os_config()['username'];
}

function life_os_password(): string
{
    return life_os_config()['password'];
}

function life_os_is_authenticated(): bool
{
    life_os_start_session();
    try {
        $config = life_os_config();
        $fingerprint = hash('sha256', $config['username'] . "\0" . $config['password']);
        return ($_SESSION['life_os_authenticated'] ?? false) === true
            && hash_equals($fingerprint, (string) ($_SESSION['life_os_fingerprint'] ?? ''));
    } catch (Throwable) {
        return false;
    }
}

function life_os_require_auth(): void
{
    if (!life_os_is_authenticated()) {
        $requestUri = (string) ($_SERVER['REQUEST_URI'] ?? '');
        if (str_contains((string) ($_SERVER['HTTP_ACCEPT'] ?? ''), 'application/json') || str_contains($requestUri, '/api.php') || str_contains($requestUri, '/state.php')) {
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

function life_os_login(string $username, string $password): bool
{
    life_os_start_session();
    if (!hash_equals(life_os_username(), $username) || !hash_equals(life_os_password(), $password)) {
        return false;
    }

    session_regenerate_id(true);
    $_SESSION['life_os_authenticated'] = true;
    $_SESSION['life_os_username'] = $username;
    $_SESSION['life_os_fingerprint'] = hash('sha256', $username . "\0" . $password);
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
