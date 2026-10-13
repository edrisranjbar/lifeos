<?php
declare(strict_types=1);

// Real endpoint, disposable SQLite data; session authentication is tested separately.
$directory = sys_get_temp_dir() . '/lifeos_logs_' . bin2hex(random_bytes(6));
mkdir($directory . '/public_html/habittify', 0700, true);
mkdir($directory . '/lib');
foreach (['api_response.php', 'habits.php', 'runtime_config.php', 'user_context.php'] as $file) copy(dirname(__DIR__) . '/lib/' . $file, $directory . '/lib/' . $file);
copy(dirname(__DIR__) . '/public_html/habittify/api.php', $directory . '/public_html/habittify/api.php');
file_put_contents($directory . '/auth.php', '<?php function life_os_require_auth(): void {} function life_os_require_csrf(): void { throw new RuntimeException("Unexpected write"); } function life_os_db(): PDO { return $GLOBALS["fixtureDb"]; }');
file_put_contents($directory . '/request.php', <<<'PHP'
<?php
class LogsTestDb extends PDO {
    public int $logQueries = 0;
    public function prepare(string $query, array $options = []): PDOStatement|false {
        if (str_starts_with($query, 'SELECT habit_id, log_date')) $this->logQueries++;
        return parent::prepare(str_replace('INSERT IGNORE', 'INSERT OR IGNORE', $query), $options);
    }
}
$db = new LogsTestDb('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$GLOBALS['fixtureDb'] = $db;
$db->exec('CREATE TABLE categories (user_id INTEGER NOT NULL DEFAULT 1, name TEXT, created_at TEXT, UNIQUE(user_id, name))');
$db->exec('CREATE TABLE habits (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL DEFAULT 1, category TEXT)');
$db->exec("INSERT INTO habits (id, category) VALUES (1, '')");
$db->exec('CREATE TABLE habit_logs (user_id INTEGER NOT NULL DEFAULT 1, habit_id INTEGER, log_date TEXT, done INTEGER)');
$db->exec("INSERT INTO habit_logs (habit_id, log_date, done) VALUES (1, '2028-02-28', 1), (1, '2028-02-29', 1), (2, '2028-02-29', 0), (1, '2028-03-01', 1)");
// Another account's log on the same day must never appear.
$db->exec("INSERT INTO habit_logs (user_id, habit_id, log_date, done) VALUES (2, 9, '2028-02-29', 1)");
$_GET = json_decode($argv[1], true);
$_GET['route'] = 'logs';
$_SERVER['REQUEST_METHOD'] = 'GET';
register_shutdown_function(function () use ($db) { fwrite(STDERR, json_encode(['status' => http_response_code() ?: 200, 'queries' => $db->logQueries])); });
require __DIR__ . '/public_html/habittify/api.php';
PHP);
$checks = 0;
function request(array $query): array {
    global $directory;
    $process = proc_open([PHP_BINARY, $directory . '/request.php', json_encode($query)], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    fclose($pipes[0]);
    $body = stream_get_contents($pipes[1]); fclose($pipes[1]);
    $meta = stream_get_contents($pipes[2]); fclose($pipes[2]);
    if (proc_close($process) !== 0 || !is_array(json_decode($meta, true)) || !is_array(json_decode($body, true))) throw new RuntimeException('Endpoint fixture failed: ' . $meta);
    return [json_decode($meta, true), json_decode($body, true)];
}
function check(bool $condition, string $message): void {
    global $checks;
    if (!$condition) throw new RuntimeException($message);
    $checks++;
}
try {
    $invalid = [null, '', '2028-2-01', '2028-02-30', '2027-02-29', '2028-13-01', '2028-00-01', '2028-02-00', '2028-02-29T00:00:00Z', ' 2028-02-29', [], 123];
    foreach (['start', 'end'] as $field) {
        foreach ($invalid as $value) {
            $query = ['start' => '2028-02-28', 'end' => '2028-03-01'];
            $query[$field] = $value;
            [$meta, $body] = request($query);
            check($meta['status'] === 400 && isset($body['error']) && $meta['queries'] === 0, "Invalid $field is rejected before querying logs.");
        }
        $query = ['start' => '2028-02-28', 'end' => '2028-03-01']; unset($query[$field]);
        [$meta] = request($query);
        check($meta['status'] === 400 && $meta['queries'] === 0, "Missing $field is rejected.");
    }
    [$meta] = request(['start' => '2028-03-01', 'end' => '2028-02-29']);
    check($meta['status'] === 400 && $meta['queries'] === 0, 'Reversed ranges are rejected.');
    [$meta, $body] = request(['start' => '2028-02-29', 'end' => '2028-02-29']);
    check($meta['status'] === 200 && $body === ['logs' => ['2028-02-29' => [1]]], 'Same-day leap-day range includes completed logs only.');
    [$meta, $body] = request(['start' => '2028-02-28', 'end' => '2028-03-01']);
    check($meta['status'] === 200 && array_keys($body['logs']) === ['2028-02-28', '2028-02-29', '2028-03-01'], 'Valid ranges remain inclusive.');
    echo "habittify_logs_test: $checks checks passed\n";
} finally {
    foreach (glob($directory . '/public_html/habittify/*') as $file) unlink($file);
    rmdir($directory . '/public_html/habittify'); rmdir($directory . '/public_html');
    foreach (glob($directory . '/lib/*') as $file) unlink($file);
    rmdir($directory . '/lib');
    foreach (glob($directory . '/*') as $file) unlink($file);
    rmdir($directory);
}
