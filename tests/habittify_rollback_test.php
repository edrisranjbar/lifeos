<?php
declare(strict_types=1);

// Execute the real category deletion endpoint with an injected database failure.
$fixture = sys_get_temp_dir() . '/lifeos_category_' . bin2hex(random_bytes(6));
mkdir($fixture . '/public_html/habittify', 0700, true);
mkdir($fixture . '/lib');
foreach (['api_response.php', 'runtime_config.php', 'habits.php', 'user_context.php'] as $file) copy(dirname(__DIR__) . '/lib/' . $file, $fixture . '/lib/' . $file);
copy(dirname(__DIR__) . '/public_html/habittify/api.php', $fixture . '/public_html/habittify/api.php');
file_put_contents($fixture . '/auth.php', '<?php function life_os_require_auth(): void {} function life_os_require_csrf(): void {} function life_os_db(): PDO { return $GLOBALS["db"]; }');
file_put_contents($fixture . '/request.php', <<<'PHP'
<?php
ini_set('error_log', __DIR__ . '/errors.log');
$db = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$db->exec('CREATE TABLE categories (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL DEFAULT 1, name TEXT, created_at TEXT)');
$db->exec('CREATE TABLE habits (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL DEFAULT 1, category TEXT)');
$db->exec("INSERT INTO categories (id, name, created_at) VALUES (1, 'Learning', 'now')");
$db->exec("INSERT INTO habits (id, category) VALUES (1, 'Learning')");
$db->exec("CREATE TRIGGER fail_delete BEFORE DELETE ON categories BEGIN SELECT RAISE(ABORT, 'fixture failure'); END");
$_GET = ['route' => 'categories/1']; $_SERVER['REQUEST_METHOD'] = 'DELETE';
register_shutdown_function(function () use ($db) {
    fwrite(STDERR, json_encode([
        'status' => http_response_code(), 'transaction' => $db->inTransaction(),
        'category' => $db->query('SELECT category FROM habits')->fetchColumn(),
        'count' => $db->query('SELECT COUNT(*) FROM categories')->fetchColumn(),
    ]));
});
require __DIR__ . '/public_html/habittify/api.php';
PHP);
try {
    $process = proc_open([PHP_BINARY, $fixture . '/request.php'], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    fclose($pipes[0]);
    $body = stream_get_contents($pipes[1]); fclose($pipes[1]);
    $meta = json_decode(stream_get_contents($pipes[2]), true); fclose($pipes[2]);
    if (proc_close($process) !== 0 || !is_array($meta)) throw new RuntimeException('Fixture failed');
    if ($meta['status'] !== 503 || $meta['transaction'] || $meta['category'] !== 'Learning' || (int) $meta['count'] !== 1 || !isset(json_decode($body, true)['error'])) throw new RuntimeException('Category deletion failed to roll back');
    echo "Passed category-delete failure rollback and response checks\n";
} finally {
    foreach (glob($fixture . '/public_html/habittify/*') as $file) unlink($file);
    rmdir($fixture . '/public_html/habittify'); rmdir($fixture . '/public_html');
    foreach (glob($fixture . '/lib/*') as $file) unlink($file);
    rmdir($fixture . '/lib');
    foreach (glob($fixture . '/*') as $file) unlink($file);
    rmdir($fixture);
}
