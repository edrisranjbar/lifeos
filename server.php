<?php

declare(strict_types=1);

require_once __DIR__ . '/auth.php';

$requestPath = parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH) ?: '/';
$relativePath = ltrim(rawurldecode($requestPath), '/');

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
