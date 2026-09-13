<?php

declare(strict_types=1);

require_once __DIR__ . '/auth.php';
life_os_start_session();

$redirect = (string) ($_GET['redirect'] ?? $_POST['redirect'] ?? '/');
if ($redirect === '' || !str_starts_with($redirect, '/') || str_starts_with($redirect, '//')) {
    $redirect = '/';
}

$error = '';
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    try {
        if (life_os_login((string) ($_POST['username'] ?? ''), (string) ($_POST['password'] ?? ''))) {
            life_os_db();
            header('Location: ' . $redirect);
            exit;
        }
        $error = 'نام کاربری یا رمز عبور نادرست است.';
    } catch (Throwable $exception) {
        error_log($exception->__toString());
        life_os_logout();
        $error = 'پیکربندی یا اتصال پایگاه داده آماده نیست. فایل config.php و دسترسی MySQL را بررسی کنید.';
    }
}
if (life_os_is_authenticated()) {
    header('Location: ' . $redirect);
    exit;
}
?><!doctype html>
<html lang="fa" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ورود · Edi Life OS</title>
<style>
:root{color-scheme:dark;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#111827;color:#f8fafc}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 20% 10%,#26314d,#111827 55%)}main{width:min(100%,420px);padding:34px;border:1px solid #334155;border-radius:22px;background:#172033eF;box-shadow:0 24px 80px #0006}h1{margin:0 0 8px;font-size:28px}p{color:#aab7cb;margin:0 0 28px}label{display:block;margin:16px 0 7px;color:#cbd5e1}input{width:100%;border:1px solid #475569;border-radius:11px;background:#0f172a;color:#fff;padding:13px;font-size:16px}button{width:100%;margin-top:24px;border:0;border-radius:11px;padding:13px;background:#8b5cf6;color:#fff;font-weight:700;font-size:16px;cursor:pointer}.error{padding:10px 12px;border-radius:10px;background:#7f1d1d;color:#fecaca;margin-bottom:16px}.brand{color:#a78bfa;font-weight:800;margin-bottom:20px}
</style></head><body><main><div class="brand">e. Edi Life OS</div><h1>خوش آمدید</h1><p>برای ورود به فضای شخصی خود وارد شوید.</p><?php if ($error): ?><div class="error" role="alert"><?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?></div><?php endif; ?><form method="post"><input type="hidden" name="redirect" value="<?= htmlspecialchars($redirect, ENT_QUOTES, 'UTF-8') ?>"><label for="username">نام کاربری</label><input id="username" name="username" autocomplete="username" required autofocus><label for="password">رمز عبور</label><input id="password" type="password" name="password" autocomplete="current-password" required><button type="submit">ورود</button></form></main></body></html>
