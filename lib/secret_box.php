<?php

declare(strict_types=1);

require_once __DIR__ . '/runtime_config.php';

/**
 * Encrypts third-party secrets (mail app passwords, AI keys) at rest with AES-256-GCM.
 * The key comes from LIFEOS_SECRET_KEY / config 'secret_key', or is generated once and
 * kept beside the attachment files, outside the web root.
 */
function secret_box_key(): string
{
    static $key = null;
    if ($key !== null) return $key;
    $configured = (string) life_os_setting('secret_key', 'LIFEOS_SECRET_KEY', '');
    if ($configured !== '') return $key = hash('sha256', $configured, true);
    $root = dirname(__DIR__);
    $directory = dirname($root) . '/.lifeos-files-' . substr(hash('sha256', $root), 0, 12);
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) throw new RuntimeException('Secret storage is unavailable.');
    $file = $directory . '/.secret-key';
    if (!is_file($file)) {
        // 'x' fails if another request created the key first; then read theirs.
        $handle = @fopen($file, 'x');
        if ($handle !== false) {
            fwrite($handle, base64_encode(random_bytes(32)));
            fclose($handle);
            @chmod($file, 0600);
        }
    }
    $stored = base64_decode(trim((string) file_get_contents($file)), true);
    if ($stored === false || strlen($stored) !== 32) throw new RuntimeException('Secret key file is invalid.');
    return $key = $stored;
}

/** $context binds a ciphertext to its owner and purpose, so it cannot be moved to another row. */
function secret_box_seal(string $plain, string $context, ?string $key = null): string
{
    $iv = random_bytes(12);
    $tag = '';
    $cipher = openssl_encrypt($plain, 'aes-256-gcm', $key ?? secret_box_key(), OPENSSL_RAW_DATA, $iv, $tag, $context, 16);
    if ($cipher === false) throw new RuntimeException('Unable to encrypt secret.');
    return 'v1:' . base64_encode($iv . $tag . $cipher);
}

function secret_box_open(string $sealed, string $context, ?string $key = null): ?string
{
    if (!str_starts_with($sealed, 'v1:')) return null;
    $raw = base64_decode(substr($sealed, 3), true);
    if ($raw === false || strlen($raw) < 28) return null;
    $plain = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', $key ?? secret_box_key(), OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16), $context);
    return $plain === false ? null : $plain;
}
