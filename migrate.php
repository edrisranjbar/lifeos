<?php

declare(strict_types=1);

// Applies pending schema migrations. Requests also do this on demand, so
// running it on deploy is optional; it just keeps the first request fast.
require_once __DIR__ . '/db.php';

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

try {
    $db = life_os_db();
    echo 'Database schema is at version ' . life_os_schema_version($db) . ".\n";
} catch (Throwable $error) {
    fwrite(STDERR, 'Migration failed: ' . $error->getMessage() . "\n");
    exit(1);
}
