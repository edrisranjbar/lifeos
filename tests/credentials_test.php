<?php

declare(strict_types=1);

// Use the real config/seeding code with disposable SQLite data; never read config.php.
$directory = sys_get_temp_dir() . '/lifeos_credentials_' . bin2hex(random_bytes(6));
mkdir($directory);
copy(dirname(__DIR__) . '/db.php', $directory . '/db.php');
$config = ['db_host' => 'localhost', 'db_name' => 'fixture', 'db_user' => 'fixture', 'db_password' => ''];
file_put_contents($directory . '/config.php', '<?php return ' . var_export($config, true) . ';');
require $directory . '/db.php';

// Adapt only MySQL's insert-ignore spelling; constraints and stored hashes are real.
final class CredentialTestDb extends PDO
{
    public function prepare(string $query, array $options = []): PDOStatement|false
    {
        return parent::prepare(str_replace('INSERT IGNORE', 'INSERT OR IGNORE', $query), $options);
    }
}
$checks = 0;
function check(bool $condition, string $message): void
{
    global $checks;
    if (!$condition) throw new RuntimeException($message);
    $checks++;
}
try {
    check(life_os_config() === $config, 'Configuration does not require bootstrap credentials.');
    $db = new CredentialTestDb('sqlite:' . $directory . '/credentials.db');
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->exec('CREATE TABLE app_credentials (credential_id INTEGER PRIMARY KEY, username TEXT, password_hash TEXT)');
    foreach ([[], ['username' => 'initial'], ['username' => 'initial', 'password' => ''], ['username' => '', 'password' => 'fixture-password'], ['username' => 'initial', 'password' => 123]] as $input) {
        try {
            life_os_initialize_credentials($db, $input);
            throw new RuntimeException('Invalid first-run credentials were accepted.');
        } catch (RuntimeException $error) {
            check(str_starts_with($error->getMessage(), 'Initial sign-in setup requires configuration:'), 'First-run setup fails clearly without valid credentials.');
        }
        check((int) $db->query('SELECT COUNT(*) FROM app_credentials')->fetchColumn() === 0, 'Failed setup does not create credentials.');
    }
    life_os_initialize_credentials($db, ['username' => 'initial', 'password' => 'fixture-password']);
    $original = $db->query('SELECT * FROM app_credentials')->fetch(PDO::FETCH_ASSOC);
    check($original['username'] === 'initial' && password_verify('fixture-password', $original['password_hash']), 'First-run setup stores a valid hash.');
    check($original['password_hash'] !== 'fixture-password', 'The stored credential is not plaintext.');
    foreach ([[], ['password' => ''], ['username' => 'replacement', 'password' => 'replacement-password']] as $input) {
        life_os_initialize_credentials($db, $input);
        check($db->query('SELECT * FROM app_credentials')->fetch(PDO::FETCH_ASSOC) === $original, 'Existing credentials remain unchanged without bootstrap values or with changed values.');
    }

    // Exercise the real authentication code in a separate process with only a DB fixture.
    $fixture = $directory . '/auth-fixture';
    mkdir($fixture);
    copy(dirname(__DIR__) . '/auth.php', $fixture . '/auth.php');
    mkdir($fixture . '/lib');
    copy(dirname(__DIR__) . '/lib/user_context.php', $fixture . '/lib/user_context.php');
    // Schema version 3 signs in against app_users; mirror the migrated original account.
    $db->exec("CREATE TABLE app_users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, password_hash TEXT, role TEXT NOT NULL DEFAULT 'admin', active INTEGER NOT NULL DEFAULT 1)");
    $db->exec('INSERT INTO app_users (id, username, password_hash) SELECT 1, username, password_hash FROM app_credentials WHERE credential_id = 1');
    file_put_contents($fixture . '/db.php', <<<'PHP'
<?php
function life_os_config(): array {
    $GLOBALS['configReads']++;
    return ['username' => 'initial', 'password' => 'fixture-password'];
}
function life_os_db(): PDO {
    if (isset($GLOBALS['authFailure'])) throw $GLOBALS['authFailure'];
    return $GLOBALS['credentialDb'];
}
PHP);
    file_put_contents($fixture . '/test.php', <<<'PHP'
<?php
putenv('LIFEOS_TRUST_PROXY=false');
$GLOBALS['configReads'] = 0;
ini_set('session.save_path', dirname(__DIR__));
ini_set('error_log', dirname(__DIR__) . '/authentication.log');
require __DIR__ . '/auth.php';
$GLOBALS['credentialDb'] = new PDO('sqlite:' . dirname(__DIR__) . '/credentials.db');
$row = life_os_credentials();
life_os_start_session();
$_SESSION['life_os_authenticated'] = true;
$_SESSION['life_os_fingerprint'] = life_os_credential_fingerprint($row);
$results = [life_os_is_authenticated()];
$_SESSION['life_os_fingerprint'] = hash('sha256', 'initial' . "\0" . 'fixture-password');
$results[] = life_os_is_authenticated();
$_SESSION['life_os_fingerprint'] = life_os_credential_fingerprint($row);
// A deactivated account loses its existing session.
$GLOBALS['credentialDb']->exec('UPDATE app_users SET active = 0');
$results[] = life_os_is_authenticated();
$GLOBALS['credentialDb']->exec('UPDATE app_users SET active = 1');
$GLOBALS['credentialDb']->exec("UPDATE app_users SET password_hash = 'changed-hash'");
$results[] = life_os_is_authenticated();
$_SESSION['life_os_authenticated'] = false;
$results[] = life_os_is_authenticated();
// Ordinary invalid sessions should not produce server-error diagnostics.
$results[] = !is_file(dirname(__DIR__) . '/authentication.log');
$_SESSION['life_os_authenticated'] = true;
foreach ([new RuntimeException('private-config-sentinel'), new PDOException('private-db-sentinel')] as $failure) {
    $GLOBALS['authFailure'] = $failure;
    $results[] = life_os_is_authenticated();
}
session_destroy();
$results[] = $GLOBALS['configReads'];
echo json_encode($results);
PHP);
    $process = proc_open([PHP_BINARY, $fixture . '/test.php'], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    fclose($pipes[0]);
    $output = stream_get_contents($pipes[1]); fclose($pipes[1]);
    $errors = stream_get_contents($pipes[2]); fclose($pipes[2]);
    check(proc_close($process) === 0 && $errors === '', 'Authentication fixture runs cleanly.');
    check(json_decode($output, true) === [true, false, false, false, false, true, false, false, 0], 'Current sessions work; deactivated and invalid sessions are quiet and backend failures still deny authentication.');
    $log = file_get_contents($directory . '/authentication.log');
    check(substr_count($log, 'LifeOS authentication failed:') === 2, 'Both backend failures are logged.');
    check(str_contains($log, 'RuntimeException (code 0) at ') && str_contains($log, 'PDOException (code 0) at '), 'Logs identify the exception type, code and source location.');
    check(!str_contains($log, 'private-config-sentinel') && !str_contains($log, 'private-db-sentinel'), 'Exception messages that might contain secrets are not logged.');
    echo "credentials_test: $checks checks passed\n";
} finally {
    $db = null;
    unset($error);
    gc_collect_cycles();
    foreach (glob($directory . '/auth-fixture/lib/*') ?: [] as $file) unlink($file);
    if (is_dir($directory . '/auth-fixture/lib')) rmdir($directory . '/auth-fixture/lib');
    foreach (glob($directory . '/auth-fixture/*') ?: [] as $file) if (is_file($file)) unlink($file);
    if (is_dir($directory . '/auth-fixture')) rmdir($directory . '/auth-fixture');
    foreach (glob($directory . '/*') as $file) unlink($file);
    rmdir($directory);
}
