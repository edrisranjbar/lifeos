<?php

declare(strict_types=1);

require_once __DIR__ . '/lib/schema.php';

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
    try {
        $connection = new PDO($serverDsn . ';dbname=' . $databaseName, $config['db_user'], $config['db_password'], $options);
    } catch (PDOException $error) {
        if (!str_contains($error->getMessage(), '[1049]')) throw $error; // 1049: unknown database.
        $server = new PDO($serverDsn, $config['db_user'], $config['db_password'], $options);
        $server->exec('CREATE DATABASE IF NOT EXISTS `' . $databaseName . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        $connection = new PDO($serverDsn . ';dbname=' . $databaseName, $config['db_user'], $config['db_password'], $options);
    }
    life_os_migrate($connection);
    $db = $connection;
    return $db;
}
