<?php

declare(strict_types=1);

require_once __DIR__ . '/db.php';

if (PHP_SAPI !== 'cli' || count($argv) !== 2 || !is_file($argv[1])) {
    fwrite(STDERR, "Usage: php migrate-sqlite.php /absolute/path/to/habits.db\n");
    exit(1);
}

try {
    $source = new PDO('sqlite:' . realpath($argv[1]), null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $target = life_os_db();
    foreach (['categories', 'habits', 'habit_logs'] as $table) {
        if ((int) $target->query("SELECT COUNT(*) FROM $table")->fetchColumn() !== 0) {
            throw new RuntimeException("MySQL $table already has data. Import into an empty database to avoid overwriting it.");
        }
    }
    $target->beginTransaction();
    foreach ([
        'categories' => ['id', 'name', 'created_at'],
        'habits' => ['id', 'name', 'category', 'color', 'icon', 'created_at', 'archived'],
        'habit_logs' => ['id', 'habit_id', 'log_date', 'done', 'created_at'],
    ] as $table => $columns) {
        $rows = $source->query("SELECT * FROM $table")->fetchAll();
        $insert = $target->prepare('INSERT INTO ' . $table . ' (' . implode(', ', $columns) . ') VALUES (' . implode(', ', array_fill(0, count($columns), '?')) . ')');
        foreach ($rows as $row) {
            $insert->execute(array_map(static fn(string $column) => $row[$column] ?? ($column === 'category' ? '' : null), $columns));
        }
        echo $table . ': ' . count($rows) . " rows\n";
    }
    $target->commit();
    echo "Import complete. Keep the SQLite file as a backup until verified.\n";
} catch (Throwable $error) {
    if (isset($target) && $target->inTransaction()) $target->rollBack();
    fwrite(STDERR, $error->getMessage() . "\n");
    exit(1);
}
