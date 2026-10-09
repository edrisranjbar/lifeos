<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';
life_os_require_auth();
header('Cache-Control: private, no-store');
header('X-Content-Type-Options: nosniff');

function attachment_reply(array $data, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function attachment_ini_bytes(string $value): int {
    $value = trim($value);
    if ($value === '') return PHP_INT_MAX;
    $number = (float) $value;
    $unit = strtolower(substr($value, -1));
    $bytes = (int) ($number * match ($unit) { 'g' => 1073741824, 'm' => 1048576, 'k' => 1024, default => 1 });
    return $bytes > 0 ? $bytes : PHP_INT_MAX;
}
function attachment_storage(): string {
    // Keep uploaded bytes outside both the local public directory and hosting webroot.
    return dirname(__DIR__) . '/.lifeos-files-' . substr(hash('sha256', __DIR__), 0, 12);
}
function attachment_public(array $row): array {
    return ['id' => $row['attachment_id'], 'name' => $row['filename'], 'size' => (int) $row['byte_size'], 'createdAt' => $row['created_at'], 'url' => '/attachments.php?id=' . $row['attachment_id']];
}

try {
    $db = life_os_db();
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $limit = min(8 * 1024 * 1024, attachment_ini_bytes((string) ini_get('upload_max_filesize')), max(1, attachment_ini_bytes((string) ini_get('post_max_size')) - 65536));
    if ($method === 'GET' && isset($_GET['id'])) {
        $id = (string) $_GET['id'];
        if (!preg_match('/^[a-f0-9]{32}$/D', $id)) attachment_reply(['error' => 'Attachment not found.'], 404);
        $query = $db->prepare('SELECT * FROM card_attachments WHERE attachment_id = ?');
        $query->execute([$id]);
        $row = $query->fetch();
        $path = attachment_storage() . '/' . $id . '.bin';
        if (!$row || !is_file($path)) attachment_reply(['error' => 'Attachment not found.'], 404);
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="download"; filename*=UTF-8\'\'' . rawurlencode($row['filename']));
        header('Content-Length: ' . filesize($path));
        readfile($path);
        exit;
    }
    if (!in_array($method, ['GET', 'POST', 'DELETE'], true)) attachment_reply(['error' => 'Method not allowed.'], 405);
    if ($method !== 'GET') {
        life_os_start_session();
        if (empty($_SESSION['state_csrf']) || !hash_equals((string) $_SESSION['state_csrf'], (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) attachment_reply(['error' => 'Invalid request token. Reload the page.'], 403);
    }
    if ($method === 'DELETE') {
        $id = (string) ($_GET['id'] ?? '');
        if (!preg_match('/^[a-f0-9]{32}$/D', $id)) attachment_reply(['error' => 'Attachment not found.'], 404);
        $delete = $db->prepare('DELETE FROM card_attachments WHERE attachment_id = ?');
        $delete->execute([$id]);
        $path = attachment_storage() . '/' . $id . '.bin';
        if (is_file($path) && !unlink($path)) error_log('Unable to remove attachment bytes: ' . $id);
        attachment_reply(['ok' => true]);
    }
    if ($method === 'POST' && empty($_POST) && (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) attachment_reply(['error' => 'File exceeds the hosting upload limit.'], 413);
    $boardId = (string) ($method === 'POST' ? ($_POST['board'] ?? '') : ($_GET['board'] ?? ''));
    $cardId = (string) ($method === 'POST' ? ($_POST['card'] ?? '') : ($_GET['card'] ?? ''));
    if (!preg_match('/^[a-zA-Z0-9_-]{1,100}$/D', $boardId) || !preg_match('/^[a-zA-Z0-9_-]{1,100}$/D', $cardId)) attachment_reply(['error' => 'Invalid card.'], 400);
    if ($method === 'GET') {
        $query = $db->prepare('SELECT * FROM card_attachments WHERE board_id = ? AND card_id = ? ORDER BY created_at, attachment_id');
        $query->execute([$boardId, $cardId]);
        attachment_reply(['attachments' => array_map('attachment_public', $query->fetchAll()), 'maxSize' => $limit]);
    }
    $stateQuery = $db->prepare('SELECT state_value FROM app_state WHERE state_key = ?');
    $stateQuery->execute(['kanban_boards_v1']);
    $state = json_decode((string) $stateQuery->fetchColumn(), true);
    $exists = false;
    foreach (($state['boards'] ?? []) as $board) {
        if (($board['id'] ?? '') !== $boardId) continue;
        foreach (($board['columns'] ?? []) as $column) foreach (($column['cards'] ?? []) as $card) if (($card['id'] ?? '') === $cardId) $exists = true;
    }
    if (!$exists) attachment_reply(['error' => 'Card is not saved yet. Please save it and try again.'], 404);
    $file = $_FILES['file'] ?? null;
    if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        $tooLarge = in_array($file['error'] ?? null, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true);
        attachment_reply(['error' => $tooLarge ? 'File exceeds the hosting upload limit.' : 'Upload failed. Choose a file and try again.'], $tooLarge ? 413 : 400);
    }
    if ((int) $file['size'] > $limit) attachment_reply(['error' => 'File is too large.'], 413);
    if (!is_uploaded_file($file['tmp_name'])) attachment_reply(['error' => 'Invalid upload.'], 400);
    $filename = preg_replace('/[\x00-\x1f\x7f\/\\\\]/u', '_', (string) $file['name']);
    if (!$filename || strlen($filename) > 240) attachment_reply(['error' => 'Use a shorter filename.'], 400);
    $storage = attachment_storage();
    if (!is_dir($storage) && !mkdir($storage, 0750, true) && !is_dir($storage)) throw new RuntimeException('Cannot create attachment directory.');
    $id = bin2hex(random_bytes(16));
    $path = $storage . '/' . $id . '.bin';
    if (!move_uploaded_file($file['tmp_name'], $path)) throw new RuntimeException('Cannot store uploaded file.');
    chmod($path, 0640);
    try {
        $insert = $db->prepare('INSERT INTO card_attachments (attachment_id, board_id, card_id, filename, byte_size) VALUES (?, ?, ?, ?, ?)');
        $insert->execute([$id, $boardId, $cardId, $filename, (int) $file['size']]);
    } catch (Throwable $error) {
        unlink($path);
        throw $error;
    }
    $query = $db->prepare('SELECT * FROM card_attachments WHERE attachment_id = ?');
    $query->execute([$id]);
    attachment_reply(['attachment' => attachment_public($query->fetch())], 201);
} catch (Throwable $error) {
    error_log($error->__toString());
    attachment_reply(['error' => 'Unable to access attachment storage. Please try again.'], 503);
}
