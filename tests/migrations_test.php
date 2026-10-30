<?php
declare(strict_types=1);

// Run only against an explicitly supplied disposable local MySQL port.
$port = (int) ($argv[1] ?? 0);
if ($port < 1024 || $port > 65535) throw new RuntimeException('Supply a dedicated local MySQL test port.');
$server = new PDO('mysql:host=127.0.0.1;port=' . $port, 'root', getenv('LIFEOS_TEST_DB_PASSWORD') ?: '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$fixture = sys_get_temp_dir() . '/lifeos_migration_' . bin2hex(random_bytes(6));
mkdir($fixture);
copy(dirname(__DIR__) . '/db.php', $fixture . '/db.php');
$fixtureConfig = ['db_host' => '127.0.0.1', 'db_name' => 'unused', 'db_user' => 'root', 'db_password' => '', 'username' => bin2hex(random_bytes(8)), 'password' => bin2hex(random_bytes(32))];
file_put_contents($fixture . '/config.php', '<?php return ' . var_export($fixtureConfig, true) . ';');
require $fixture . '/db.php';
require dirname(__DIR__) . '/lib/schema.php';
$databases = [];
$checks = 0;
function check(bool $value, string $label): void { global $checks; if (!$value) throw new RuntimeException($label); $checks++; }
function database(): PDO {
    global $server, $databases, $port;
    $name = 'lifeos_migration_test_' . bin2hex(random_bytes(6));
    $server->exec('CREATE DATABASE `' . $name . '` CHARACTER SET utf8mb4'); $databases[] = $name;
    return new PDO('mysql:host=127.0.0.1;port=' . $port . ';dbname=' . $name, 'root', getenv('LIFEOS_TEST_DB_PASSWORD') ?: '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
}
try {
    $db = database();
    check(life_os_migrate($db) === 4, 'Fresh database receives all four migrations');
    check((int) $db->query('SELECT COUNT(*) FROM mail_accounts')->fetchColumn() === 0 && (int) $db->query('SELECT COUNT(*) FROM mail_digests')->fetchColumn() === 0, 'Mail tables created empty');
    check((int) $db->query("SELECT COUNT(*) FROM app_users WHERE id = 1 AND role = 'admin' AND active = 1")->fetchColumn() === 1, 'Fresh database has an active original administrator');
    check((int) $db->query('SELECT COUNT(*) FROM habits')->fetchColumn() === 3, 'First setup seeds defaults');
    $db->exec('DELETE FROM habits');
    check(life_os_migrate($db) === 0, 'Current schema skips all DDL');
    check((int) $db->query('SELECT COUNT(*) FROM habits')->fetchColumn() === 0, 'Empty habits stay empty');
    $db->exec("INSERT INTO app_state (state_key, state_value) VALUES ('preserve', '{\"unknown\":{}}')");
    $hash = $db->query('SELECT password_hash FROM app_credentials')->fetchColumn();
    // Simulate an existing installation that has no migration history.
    $db->exec('DROP TABLE schema_migrations');
    file_put_contents($fixture . '/config.php', "<?php return ['db_host'=>'127.0.0.1','db_name'=>'unused','db_user'=>'root','db_password'=>''];");
    check(life_os_migrate($db) === 4, 'Unversioned installation upgrades without bootstrap password');
    check($db->query('SELECT password_hash FROM app_users WHERE id = 1')->fetchColumn() === $hash, 'Original account keeps its password hash');
    check((int) $db->query("SELECT user_id FROM app_state WHERE state_key='preserve'")->fetchColumn() === 1, 'Existing records belong to the original account');
    check($db->query("SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'app_state' AND index_name = 'PRIMARY'")->fetchColumn() === 'user_id,state_key', 'State documents are unique per account');
    $db->exec("INSERT INTO app_state (user_id, state_key, state_value) VALUES (2, 'preserve', 'second account')");
    check($db->query("SELECT state_value FROM app_state WHERE user_id = 1 AND state_key='preserve'")->fetchColumn() === '{"unknown":{}}', 'Another account can reuse a key without touching the original');
    check($db->query('SELECT password_hash FROM app_credentials')->fetchColumn() === $hash, 'Credentials preserved');
    check($db->query("SELECT state_value FROM app_state WHERE state_key='preserve'")->fetchColumn() === '{"unknown":{}}', 'State bytes preserved');
    check((int) $db->query('SELECT COUNT(*) FROM habits')->fetchColumn() === 0, 'Existing empty installation not seeded');
    $db->exec('DELETE FROM schema_migrations WHERE version >= 2');
    $db->exec('DROP TABLE login_throttle');
    check(life_os_migrate($db) === 3, 'Prototype version one upgrades');
    check((int) $db->query('SELECT COUNT(*) FROM login_throttle')->fetchColumn() === 0, 'Throttle table restored by upgrade');
    // A real version 2 installation upgrades to accounts with its data owned by the original account.
    file_put_contents($fixture . '/config.php', '<?php return ' . var_export($fixtureConfig, true) . ';');
    $old = database();
    $old->exec('CREATE TABLE schema_migrations (version INT UNSIGNED PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB');
    life_os_schema_initial($old); life_os_schema_upgrade($old);
    $old->exec('INSERT INTO schema_migrations (version) VALUES (1), (2)');
    $old->exec("INSERT INTO app_state (state_key, state_value) VALUES ('edi_notes_v1', 'owner notes')");
    $oldHash = $old->query('SELECT password_hash FROM app_credentials')->fetchColumn();
    check(life_os_migrate($old) === 2, 'Version 2 installation applies the accounts and mail migrations');
    check($old->query("SELECT CONCAT(role, ':', active, ':', password_hash) FROM app_users WHERE id = 1")->fetchColumn() === 'admin:1:' . $oldHash, 'Original sign-in becomes the active administrator');
    check((int) $old->query("SELECT user_id FROM app_state WHERE state_key = 'edi_notes_v1'")->fetchColumn() === 1, 'Version 2 records belong to the original account');
    check((int) $old->query('SELECT COUNT(*) FROM habits WHERE user_id = 1')->fetchColumn() === (int) $old->query('SELECT COUNT(*) FROM habits')->fetchColumn(), 'Version 2 habits belong to the original account');
    $old->exec("INSERT INTO categories (user_id, name, created_at) VALUES (2, 'Focus', 'now')");
    check((int) $old->query("SELECT COUNT(*) FROM categories WHERE name = 'Focus'")->fetchColumn() === 2, 'Category names are unique per account, not globally');
    $db->exec('INSERT INTO schema_migrations (version) VALUES (99)');
    try { life_os_migrate($db); throw new LogicException('Future schema accepted'); }
    catch (RuntimeException $error) { check(str_contains($error->getMessage(), 'newer'), 'Future schemas rejected'); }
    echo "Passed $checks MySQL migration checks\n";
} finally {
    foreach ($databases as $name) $server->exec('DROP DATABASE `' . $name . '`');
    unlink($fixture . '/db.php'); unlink($fixture . '/config.php'); rmdir($fixture);
}
