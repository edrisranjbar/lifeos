<?php
declare(strict_types=1);
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/lib/api_response.php';
life_os_require_auth();
header('Cache-Control: private, no-store');
header('X-Content-Type-Options: nosniff');
function users_reply(array $data, int $status = 200): never { life_os_json_reply($data, $status); }
function users_public(array $user): array {
    return ['id'=>(int)$user['id'], 'username'=>$user['username'], 'role'=>$user['role'], 'active'=>(bool)$user['active'], 'created_at'=>$user['created_at']];
}
try {
    $db = life_os_db();
    $actor = life_os_credentials();
    if ($actor['role'] !== 'admin') users_reply(['error'=>'Account administration is unavailable.'],403);
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($method === 'GET') {
        $_SESSION['state_csrf'] ??= bin2hex(random_bytes(32));
        users_reply(['users'=>array_map('users_public', $db->query('SELECT id, username, role, active, created_at FROM app_users ORDER BY id')->fetchAll()), 'current_user_id'=>life_os_user_id(), 'csrf'=>$_SESSION['state_csrf']]);
    }
    if ($method !== 'POST') { header('Allow: GET, POST'); users_reply(['error'=>'Method not allowed.'],405); }
    life_os_require_csrf(fn()=>users_reply(['error'=>'Reload Settings and try again.'],403));
    $raw = (string) file_get_contents('php://input');
    if (strlen($raw)>8000) users_reply(['error'=>'Request is too large.'],413);
    $input = json_decode($raw,true);
    if (!is_array($input)) users_reply(['error'=>'Invalid account request.'],400);
    foreach (['action','username','password','confirm_password','current_password','role'] as $field) {
        if (isset($input[$field]) && !is_string($input[$field])) users_reply(['error'=>'Invalid account details.'],400);
    }
    $action = $input['action'] ?? '';
    if (!in_array($action,['create','update'],true)) users_reply(['error'=>'Invalid account action.'],400);
    $name = trim($input['username'] ?? '');
    $password = $input['password'] ?? '';
    if ($name === '' || strlen($name)>190 || preg_match('/[\x00-\x20\x7f]/',$name)) users_reply(['error'=>'Use a username of 1–190 characters without spaces.'],400);
    if (($action === 'create' || $password !== '') && (strlen($password)<12 || strlen($password)>72)) users_reply(['error'=>'Use a password of 12–72 bytes.'],400);
    if ($password !== '' && !hash_equals($password,$input['confirm_password'] ?? '')) users_reply(['error'=>'The passwords do not match.'],400);
    if (isset($input['active']) && !is_bool($input['active'])) users_reply(['error'=>'Invalid account status.'],400);
    // Members get a private workspace only; administrators can also manage accounts.
    if (isset($input['role']) && !in_array($input['role'],['admin','user'],true)) users_reply(['error'=>'Choose Administrator or Member.'],400);
    $id = filter_var($input['id'] ?? 0,FILTER_VALIDATE_INT);
    $active = $input['active'] ?? true;
    // Serialize account administration, including the last active administrator guard.
    $db->beginTransaction();
    $all = $db->query('SELECT id, username, password_hash, role, active FROM app_users ORDER BY id FOR UPDATE')->fetchAll();
    $current = null; $target = null;
    foreach ($all as $user) {
        if ((int)$user['id'] === life_os_user_id()) $current = $user;
        if ((int)$user['id'] === $id) $target = $user;
    }
    if (!$current || !(bool)$current['active'] || $current['role'] !== 'admin' || !password_verify($input['current_password'] ?? '', $current['password_hash'])) {
        $db->rollBack(); users_reply(['error'=>'Your current password is incorrect.'],403);
    }
    if ($action === 'create') {
        $query = $db->prepare('INSERT INTO app_users(username, password_hash, role, active) VALUES (?, ?, ?, 1)');
        $query->execute([$name,password_hash($password,PASSWORD_DEFAULT),$input['role'] ?? 'user']);
        $id = (int)$db->lastInsertId();
    } else {
        if (!$target) { $db->rollBack(); users_reply(['error'=>'Account not found.'],404); }
        if ($id === life_os_user_id()) { $db->rollBack(); users_reply(['error'=>'Use My account to change your own sign-in details.'],400); }
        $role = $input['role'] ?? $target['role'];
        $admins = count(array_filter($all,fn($u)=>(bool)$u['active'] && $u['role']==='admin'));
        $losesAdmin = (bool)$target['active'] && $target['role']==='admin' && (!$active || $role!=='admin');
        if ($losesAdmin && $admins<=1) { $db->rollBack(); users_reply(['error'=>'Keep at least one active administrator.'],409); }
        $hash = $password === '' ? $target['password_hash'] : password_hash($password,PASSWORD_DEFAULT);
        $query = $db->prepare('UPDATE app_users SET username = ?, password_hash = ?, role = ?, active = ? WHERE id = ?');
        $query->execute([$name,$hash,$role,(int)$active,$id]);
    }
    $db->commit();
    users_reply(['ok'=>true,'id'=>$id],$action==='create'?201:200);
} catch (Throwable $error) {
    if (isset($db) && $db->inTransaction()) $db->rollBack();
    if ($error instanceof PDOException && $error->getCode()==='23000') users_reply(['error'=>'That username is already in use.'],409);
    error_log('LifeOS account administration failed: '.get_class($error));
    users_reply(['error'=>'Unable to manage accounts. Try again.'],503);
}
