<?php

declare(strict_types=1);

// Versioned schema. Each request reads one version number; DDL runs only when
// the database is behind, under a lock so concurrent requests cannot race.
// Add changes as a new numbered migration; never edit one that has shipped.

const LIFE_OS_SCHEMA_VERSION = 1;

/** @return array<int, callable(PDO): void> */
function life_os_schema_migrations(): array
{
    return [
        // 1: the schema as it stood before versioning. IF NOT EXISTS keeps it safe on existing installs.
        1 => function (PDO $db): void {
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
        if ($db->query('SELECT 1 FROM app_credentials WHERE credential_id = 1')->fetchColumn() === false) {
            $config = life_os_config();
            $seedCredentials = $db->prepare('INSERT IGNORE INTO app_credentials (credential_id, username, password_hash) VALUES (1, ?, ?)');
            $seedCredentials->execute([$config['username'], password_hash($config['password'], PASSWORD_DEFAULT)]);
        }
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
        },
    ];
}

function life_os_schema_version(PDO $db): int
{
    try {
        return (int) $db->query('SELECT MAX(version) FROM schema_migrations')->fetchColumn();
    } catch (PDOException $error) {
        if (($error->errorInfo[1] ?? null) === 1146) return 0; // Table does not exist yet.
        throw $error;
    }
}

/** Applies pending migrations and returns how many ran. */
function life_os_migrate(PDO $db): int
{
    if (life_os_schema_version($db) >= LIFE_OS_SCHEMA_VERSION) return 0;
    if ((int) $db->query("SELECT GET_LOCK('lifeos_schema', 30)")->fetchColumn() !== 1) {
        throw new RuntimeException('Another request is updating the database schema. Try again shortly.');
    }
    try {
        $db->exec('CREATE TABLE IF NOT EXISTS schema_migrations (
            version INT UNSIGNED PRIMARY KEY,
            applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
        $current = life_os_schema_version($db);
        $applied = 0;
        foreach (life_os_schema_migrations() as $version => $migrate) {
            if ($version <= $current) continue;
            $migrate($db);
            $db->prepare('INSERT INTO schema_migrations (version) VALUES (?)')->execute([$version]);
            $applied++;
        }
        return $applied;
    } finally {
        $db->query("SELECT RELEASE_LOCK('lifeos_schema')");
    }
}
