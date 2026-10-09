<?php

declare(strict_types=1);

require_once __DIR__ . '/auth.php';

// Every request passes through here, so set browser security headers once.
// The dashboard embeds each app in a same-origin iframe, hence 'self' framing.
// 'unsafe-inline' stays until inline <script> blocks and on* handlers move to files.
header("Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'");
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('X-Content-Type-Options: nosniff');

$requestPath = parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH) ?: '/';
$relativePath = ltrim(rawurldecode($requestPath), '/');

if (str_starts_with($requestPath, '/api/v1/')) {
    require __DIR__ . '/api.php';
    return true;
}

if ($relativePath === 'login.php') {
    require __DIR__ . '/login.php';
    return true;
}
if ($relativePath === 'logout.php') {
    require __DIR__ . '/logout.php';
    return true;
}
if ($relativePath === 'state.php') {
    require __DIR__ . '/state.php';
    return true;
}

life_os_require_auth();

if ($relativePath === 'finance-obligations.php') {
    require __DIR__ . '/finance-obligations.php';
    return true;
}

if ($relativePath === 'kanban.php') {
    require __DIR__ . '/kanban.php';
    return true;
}

if ($relativePath === 'attachments.php') {
    require __DIR__ . '/attachments.php';
    return true;
}

if ($relativePath === 'weather.php') {
    require __DIR__ . '/weather.php';
    return true;
}

if ($relativePath === 'credentials.php') {
    require __DIR__ . '/credentials.php';
    return true;
}

if ($relativePath === '') {
    $relativePath = 'index.html';
}
$file = __DIR__ . '/public_html/' . $relativePath;
$publicRoot = realpath(__DIR__ . '/public_html');
$resolved = realpath($file);

if ($resolved !== false && is_dir($resolved)) {
    $resolved = realpath($resolved . DIRECTORY_SEPARATOR . 'index.html');
}

if ($resolved === false || $publicRoot === false || !str_starts_with($resolved, $publicRoot . DIRECTORY_SEPARATOR) || !is_file($resolved)) {
    http_response_code(404);
    echo 'Not found';
    return true;
}

if ($relativePath === 'habittify/api.php') {
    require $resolved;
    return true;
}

$extensions = [
    'html' => 'text/html', 'css' => 'text/css', 'js' => 'application/javascript',
    'mjs' => 'application/javascript', 'svg' => 'image/svg+xml', 'png' => 'image/png',
    'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'ico' => 'image/x-icon',
    'woff' => 'font/woff', 'woff2' => 'font/woff2', 'ttf' => 'font/ttf',
    'mp3' => 'audio/mpeg', 'm4a' => 'audio/mp4', 'ogg' => 'audio/ogg', 'wav' => 'audio/wav',
];
$extension = strtolower(pathinfo($resolved, PATHINFO_EXTENSION));
if (!isset($extensions[$extension]) || str_contains($resolved, DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR)) {
    http_response_code(404);
    echo 'Not found';
    return true;
}
header('Content-Type: ' . $extensions[$extension] . ($extension === 'html' || $extension === 'css' || $extension === 'js' || $extension === 'mjs' ? '; charset=utf-8' : ''));
header('Cache-Control: private, no-store');
header('X-Content-Type-Options: nosniff');
readfile($resolved);
return true;
