<?php

declare(strict_types=1);

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/lib/api_response.php';
life_os_require_auth();
life_os_start_session();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function credentials_reply(array $payload, int $status = 200): never
{
    life_os_json_reply($payload, $status);
}

$_SESSION['state_csrf'] ??= bin2hex(random_bytes(32));

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    try {
        credentials_reply([
            'username' => life_os_username(),
            'user_id' => life_os_user_id(),
            'role' => life_os_credentials()['role'],
            'csrf' => $_SESSION['state_csrf'],
        ]);
    } catch (Throwable $error) {
        error_log($error->__toString());
        credentials_reply(['error' => 'Credentials are unavailable.'], 503);
    }
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: GET, POST');
    credentials_reply(['error' => 'Method not allowed.'], 405);
}

life_os_require_csrf(fn () => credentials_reply(['error' => 'Refresh the page and try again.'], 403));

$raw = (string) file_get_contents('php://input');
if (strlen($raw) > 20_000) credentials_reply(['error' => 'Request is too large.'], 413);
$input = json_decode($raw, true);
if (!is_array($input)) credentials_reply(['error' => 'Invalid request.'], 400);

$currentPassword = (string) ($input['current_password'] ?? '');
$newUsername = trim((string) ($input['new_username'] ?? ''));
$newPassword = (string) ($input['new_password'] ?? '');
$confirmPassword = (string) ($input['confirm_password'] ?? '');

if ($currentPassword === '') credentials_reply(['error' => 'Enter your current password to confirm this change.'], 400);
if ($newUsername === '' || strlen($newUsername) > 190 || preg_match('/[\x00-\x20\x7F]/', $newUsername)) {
    credentials_reply(['error' => 'Choose a username of 1–190 characters with no spaces.'], 400);
}
if ($newPassword !== '' && (strlen($newPassword) < 12 || strlen($newPassword) > 72)) {
    credentials_reply(['error' => 'A new password must be between 12 and 72 bytes.'], 400);
}
if ($newPassword !== '' && !hash_equals($newPassword, $confirmPassword)) {
    credentials_reply(['error' => 'The new passwords do not match.'], 400);
}

try {
    $db = life_os_db();
    $db->beginTransaction();
    $query = $db->prepare('SELECT username, password_hash FROM app_users WHERE id = ? FOR UPDATE');
    $query->execute([life_os_user_id()]);
    $credentials = $query->fetch();
    if (!is_array($credentials) || !password_verify($currentPassword, (string) $credentials['password_hash'])) {
        $db->rollBack();
        credentials_reply(['error' => 'Your current password is incorrect.'], 403);
    }
    if ($newUsername === $credentials['username'] && $newPassword === '') {
        $db->rollBack();
        credentials_reply(['error' => 'Enter a new username or a new password.'], 400);
    }

    $passwordHash = $newPassword === ''
        ? (string) $credentials['password_hash']
        : password_hash($newPassword, PASSWORD_DEFAULT);
    if (!is_string($passwordHash)) throw new RuntimeException('Could not hash the new password.');

    $update = $db->prepare('UPDATE app_users SET username = ?, password_hash = ? WHERE id = ?');
    $update->execute([$newUsername, $passwordHash, life_os_user_id()]);
    $db->commit();

    session_regenerate_id(true);
    $_SESSION['life_os_authenticated'] = true;
    $_SESSION['life_os_username'] = $newUsername;
    $_SESSION['life_os_fingerprint'] = life_os_credential_fingerprint([
        'username' => $newUsername,
        'password_hash' => $passwordHash,
    ]);

    credentials_reply([
        'ok' => true,
        'username' => $newUsername,
        'csrf' => $_SESSION['state_csrf'],
    ]);
} catch (Throwable $error) {
    if (isset($db) && $db->inTransaction()) $db->rollBack();
    error_log('LifeOS credential update failed: ' . get_class($error));
    if ($error instanceof PDOException && $error->getCode() === '23000') credentials_reply(['error' => 'That username is already in use.'], 409);
    credentials_reply(['error' => 'Could not update sign-in credentials.'], 500);
}
