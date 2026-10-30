<?php
declare(strict_types=1);

const LIFE_OS_SCHEMA_VERSION = 4;

function life_os_schema_version(PDO $db): int {
    try { return (int) $db->query('SELECT MAX(version) FROM schema_migrations')->fetchColumn(); }
    catch (PDOException $error) {
        if ((int) ($error->errorInfo[1] ?? 0) === 1146) return 0;
        throw $error;
    }
}

/** On current installs this does one SELECT; migrations are non-destructive. */
function life_os_migrate(PDO $db): int {
    $current = life_os_schema_version($db);
    if ($current > LIFE_OS_SCHEMA_VERSION) throw new RuntimeException('Database schema is newer than this application.');
    if ($current === LIFE_OS_SCHEMA_VERSION) return 0;
    $lock = 'lifeos_schema_' . substr(hash('sha256', (string) $db->query('SELECT DATABASE()')->fetchColumn()), 0, 32);
    $statement = $db->prepare('SELECT GET_LOCK(?, 30)'); $statement->execute([$lock]);
    if ((int) $statement->fetchColumn() !== 1) throw new RuntimeException('Database migration lock unavailable.');
    try {
        $db->exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INT UNSIGNED PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB');
        $current = life_os_schema_version($db);
        $applied = 0;
        foreach ([1 => 'life_os_schema_initial', 2 => 'life_os_schema_upgrade', 3 => 'life_os_schema_users', 4 => 'life_os_schema_mail'] as $version => $migration) {
            if ($version <= $current) continue;
            $migration($db);
            $db->prepare('INSERT INTO schema_migrations (version) VALUES (?)')->execute([$version]);
            $applied++;
        }
        return $applied;
    } finally {
        $release = $db->prepare('SELECT RELEASE_LOCK(?)'); $release->execute([$lock]);
    }
}

/** Mail credentials live only in these server-side tables, never in app_state documents. */
function life_os_schema_mail(PDO $db): void
{
    $db->exec("CREATE TABLE IF NOT EXISTS mail_accounts (
        user_id INT UNSIGNED PRIMARY KEY,
        imap_host VARCHAR(253) NOT NULL,
        imap_user VARCHAR(255) NOT NULL,
        imap_secret TEXT NOT NULL,
        ai_provider VARCHAR(32) NOT NULL DEFAULT '',
        ai_model VARCHAR(200) NOT NULL DEFAULT '',
        ai_base_url VARCHAR(255) NOT NULL DEFAULT '',
        ai_secret TEXT NULL,
        inbox_json MEDIUMTEXT NULL,
        inbox_at INT UNSIGNED NULL,
        digest_attempt_at INT UNSIGNED NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $db->exec("CREATE TABLE IF NOT EXISTS mail_digests (
        user_id INT UNSIGNED NOT NULL,
        digest_date DATE NOT NULL,
        summary MEDIUMTEXT NOT NULL,
        message_count INT UNSIGNED NOT NULL,
        total_count INT UNSIGNED NOT NULL,
        model VARCHAR(200) NOT NULL DEFAULT '',
        created_at INT UNSIGNED NOT NULL,
        PRIMARY KEY (user_id, digest_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}

/** Idempotent DDL permits resuming a partially applied MySQL migration. */
function life_os_schema_users(PDO $db): void
{
    $db->exec("CREATE TABLE IF NOT EXISTS app_users (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(190) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('admin','user') NOT NULL DEFAULT 'admin',
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin");
    $db->exec("INSERT IGNORE INTO app_users(id, username, password_hash, role)
        SELECT 1, username, password_hash, 'admin' FROM app_credentials WHERE credential_id = 1");
    if (!$db->query('SELECT 1 FROM app_users WHERE id = 1')->fetchColumn()) throw new RuntimeException('Original account is required for migration.');
    foreach (['app_state','habits','habit_logs','categories','card_attachments'] as $table) {
        $column = $db->prepare('SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?');
        $column->execute([$table, 'user_id']);
        if (!(int) $column->fetchColumn()) $db->exec('ALTER TABLE `' . $table . '` ADD COLUMN user_id INT UNSIGNED NOT NULL DEFAULT 1');
        $index = $db->prepare('SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?');
        $index->execute([$table, 'idx_user']);
        if (!(int) $index->fetchColumn()) $db->exec('ALTER TABLE `' . $table . '` ADD INDEX idx_user(user_id)');
    }
    $primary = $db->query("SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'app_state' AND index_name = 'PRIMARY'")->fetchColumn();
    if ($primary !== 'user_id,state_key') $db->exec('ALTER TABLE app_state DROP PRIMARY KEY, ADD PRIMARY KEY(user_id, state_key)');
    $unique = $db->query("SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'categories' AND index_name = 'name'")->fetchColumn();
    if ($unique !== 'user_id,name') $db->exec('ALTER TABLE categories DROP INDEX name, ADD UNIQUE KEY name(user_id, name)');
}

function life_os_schema_upgrade(PDO $db): void {
    // Also supports installations that used the earlier migration prototype.
    $db->exec('CREATE TABLE IF NOT EXISTS login_throttle (throttle_key CHAR(64) PRIMARY KEY, failures INT UNSIGNED NOT NULL, first_failure_at INT UNSIGNED NOT NULL) ENGINE=InnoDB');
    $db->prepare("INSERT IGNORE INTO categories(name, created_at) SELECT DISTINCT category, ? FROM habits WHERE TRIM(category) != ''")->execute([gmdate('Y-m-d\TH:i:s\Z')]);
}

function life_os_schema_initial(PDO $db): void
{
    $freshHabits = (int) $db->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'habits'")->fetchColumn() === 0;
    $db->exec('CREATE TABLE IF NOT EXISTS app_state (
        state_key VARCHAR(80) PRIMARY KEY,
        state_value LONGTEXT NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
    $db->exec('CREATE TABLE IF NOT EXISTS app_credentials (
        credential_id TINYINT UNSIGNED PRIMARY KEY,
        username VARCHAR(190) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
    $db->exec('CREATE TABLE IF NOT EXISTS login_throttle (
        throttle_key CHAR(64) PRIMARY KEY,
        failures INT UNSIGNED NOT NULL,
        first_failure_at INT UNSIGNED NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
    life_os_initialize_credentials($db, life_os_config());
    $db->exec("CREATE TABLE IF NOT EXISTS categories (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(60) NOT NULL UNIQUE,
        created_at VARCHAR(30) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $db->exec("CREATE TABLE IF NOT EXISTS habits (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(80) NOT NULL,
        category VARCHAR(60) NOT NULL DEFAULT '',
        color VARCHAR(20) NOT NULL DEFAULT '#64748b',
        icon VARCHAR(16) NOT NULL DEFAULT '✓',
        created_at VARCHAR(30) NOT NULL,
        archived TINYINT(1) NOT NULL DEFAULT 0,
        INDEX idx_habits_category (category)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $db->exec("CREATE TABLE IF NOT EXISTS habit_logs (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        habit_id BIGINT UNSIGNED NOT NULL,
        log_date DATE NOT NULL,
        done TINYINT(1) NOT NULL DEFAULT 1,
        created_at VARCHAR(30) NOT NULL,
        UNIQUE KEY unique_habit_date (habit_id, log_date),
        INDEX idx_logs_date (log_date),
        CONSTRAINT fk_habit_logs_habit FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $db->exec('CREATE TABLE IF NOT EXISTS card_attachments (
        attachment_id CHAR(32) PRIMARY KEY,
        board_id VARCHAR(100) NOT NULL,
        card_id VARCHAR(100) NOT NULL,
        filename VARCHAR(255) NOT NULL,
        byte_size BIGINT UNSIGNED NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_attachment_card (board_id, card_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
    // Existing empty installations stay empty; defaults belong only to first setup.
    if ($freshHabits) {
        $now = gmdate('Y-m-d\TH:i:s\Z');
        $db->beginTransaction();
        try {
            $category = $db->prepare('INSERT IGNORE INTO categories(name, created_at) VALUES (?, ?)');
            $habit = $db->prepare('INSERT INTO habits(name, category, color, icon, created_at) VALUES (?, ?, ?, ?, ?)');
            foreach ([['Deep work','Focus','#8b5cf6','◈'],['Exercise','Health','#10b981','◆'],['Reading','Learning','#f59e0b','◇']] as [$name,$group,$color,$icon]) {
                $category->execute([$group,$now]);
                $habit->execute([$name,$group,$color,$icon,$now]);
            }
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
    }
}
