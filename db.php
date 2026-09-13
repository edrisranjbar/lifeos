<?php

declare(strict_types=1);

function life_os_config(): array
{
    $file = __DIR__ . '/config.php';
    if (!is_file($file)) {
        throw new RuntimeException('Add config.php and fill in the settings.');
    }
    $config = require $file;
    if (!is_array($config)) {
        throw new RuntimeException('Invalid configuration.');
    }
    foreach (['db_host', 'db_name', 'db_user', 'username', 'password'] as $key) {
        if (!is_string($config[$key] ?? null) || $config[$key] === '') {
            throw new RuntimeException('Missing configuration: ' . $key);
        }
    }
    if (!is_string($config['db_password'] ?? null)) {
        throw new RuntimeException('Missing database password setting.');
    }
    return $config;
}

function life_os_db(): PDO
{
    static $db = null;
    if ($db instanceof PDO) return $db;
    $config = life_os_config();
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];
    $databaseName = $config['db_name'];
    if (!preg_match('/^[a-zA-Z0-9_]+$/D', $databaseName)) {
        throw new RuntimeException('Database name must contain only letters, numbers, and underscores.');
    }
    $serverDsn = sprintf('mysql:host=%s;port=%d;charset=utf8mb4', $config['db_host'], (int) ($config['db_port'] ?? 3306));
    $server = new PDO($serverDsn, $config['db_user'], $config['db_password'], $options);
    $server->exec('CREATE DATABASE IF NOT EXISTS `' . $databaseName . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    $db = new PDO($serverDsn . ';dbname=' . $databaseName, $config['db_user'], $config['db_password'], $options);
    life_os_initialize_tables($db);
    return $db;
}

function life_os_initialize_tables(PDO $db): void
{
    $db->exec('CREATE TABLE IF NOT EXISTS app_state (
        state_key VARCHAR(80) PRIMARY KEY,
        state_value LONGTEXT NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
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
}
