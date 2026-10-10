<?php

declare(strict_types=1);

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/lib/state_store.php';
life_os_require_auth();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function state_reply(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

try {
    $db = life_os_db();
    $allowed = [
        'edi_focus_v1', 'daramd_periods_v1', 'daramd_active_period_v1', 'daramd_v1',
        'kanban_boards_v1', 'edi_goals_v1', 'edi_goals_drafts_v1', 'edi_notes_v1', 'edi_notepad_v1', 'edi_growth_v1', 'edi_currency_v1',
        'edi_os_theme', 'edifinance_theme', 'habittify_theme',
        'edi_kanban_theme', 'edi_goals_theme', 'edi_notes_theme',
    ];
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($method === 'GET') {
        $rows = $db->query('SELECT state_key, state_value FROM app_state')->fetchAll();
        $data = [];
        $revisions = [];
        foreach ($rows as $row) {
            $data[$row['state_key']] = $row['state_value'];
            $revisions[$row['state_key']] = hash('sha256', $row['state_value']);
        }
        life_os_start_session();
        $_SESSION['state_csrf'] ??= bin2hex(random_bytes(32));
        state_reply(['data' => $data, 'revisions' => $revisions, 'csrf' => $_SESSION['state_csrf']]);
    }
    if ($method !== 'PUT') state_reply(['error' => 'Method not allowed'], 405);
    life_os_start_session();
    if (empty($_SESSION['state_csrf']) || !hash_equals((string) $_SESSION['state_csrf'], (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) {
        state_reply(['error' => 'Invalid request token'], 403);
    }
    $raw = (string) file_get_contents('php://input');
    if (strlen($raw) > 2_000_000) state_reply(['error' => 'Data too large'], 413);
    $payload = json_decode($raw, true);
    $key = $payload['key'] ?? null;
    $value = $payload['value'] ?? null;
    $isBackup = is_string($key) && preg_match('/^legacy_backup_[0-9a-f]{32}$/', $key);
    if (!is_string($key) || (!in_array($key, $allowed, true) && !$isBackup) || !is_string($value)) state_reply(['error' => 'Invalid data'], 400);
    if (!array_key_exists('revision', $payload)) state_reply(['error' => 'Reload the app to use the current save protocol.'], 409);
    $revision = $payload['revision'];
    if ($revision !== null && (!is_string($revision) || !preg_match('/^[a-f0-9]{64}$/D', $revision))) state_reply(['error' => 'Invalid revision'], 400);
    $newRevision = (new StateStore($db))->compareAndSwap($key, $value, $revision);
    state_reply(['ok' => true, 'revision' => $newRevision]);
} catch (ApiException $error) {
    state_reply(['error' => $error->getMessage()], $error->status);
} catch (Throwable $error) {
    error_log($error->__toString());
    state_reply(['error' => 'Database unavailable. Check config.php and MySQL.'], 503);
}
