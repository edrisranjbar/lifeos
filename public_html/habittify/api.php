<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/auth.php';
life_os_require_auth();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

const DEFAULT_ICON = "✓";

function respond(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function utc_now(): string
{
    return gmdate('Y-m-d\TH:i:s\Z');
}

function clean_text(mixed $value, string $fallback = '', int $maxLength = 80): string
{
    $text = trim((string) ($value ?? $fallback));
    return function_exists('mb_substr') ? mb_substr($text, 0, $maxLength) : substr($text, 0, $maxLength);
}

function body(): array
{
    $decoded = json_decode((string) file_get_contents('php://input'), true);
    return is_array($decoded) ? $decoded : [];
}

function database(): PDO
{
    $db = life_os_db();
    migrate($db);
    return $db;
}

function migrate(PDO $db): void
{
    $statement = $db->prepare("INSERT IGNORE INTO categories(name, created_at)
               SELECT DISTINCT category, ? FROM habits WHERE TRIM(category) != ''");
    $statement->execute([utc_now()]);

    if ((int) $db->query('SELECT COUNT(*) FROM habits')->fetchColumn() === 0) {
        $now = utc_now();
        $db->beginTransaction();
        $category = $db->prepare('INSERT IGNORE INTO categories(name, created_at) VALUES (?, ?)');
        foreach (['Focus', 'Health', 'Learning'] as $name) {
            $category->execute([$name, $now]);
        }
        $habit = $db->prepare('INSERT INTO habits(name, category, color, icon, created_at) VALUES (?, ?, ?, ?, ?)');
        $habit->execute(['Deep work', 'Focus', '#8b5cf6', '◈', $now]);
        $habit->execute(['Exercise', 'Health', '#10b981', '◆', $now]);
        $habit->execute(['Reading', 'Learning', '#f59e0b', '◇', $now]);
        $db->commit();
    }
}

function habit(PDO $db, int $id): array|false
{
    $stmt = $db->prepare('SELECT id, name, category, color, icon, created_at FROM habits WHERE id = ?');
    $stmt->execute([$id]);
    return $stmt->fetch();
}

function category(PDO $db, int $id): array|false
{
    $stmt = $db->prepare('SELECT id, name, created_at FROM categories WHERE id = ?');
    $stmt->execute([$id]);
    return $stmt->fetch();
}

try {
    $db = database();
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    $route = trim((string) ($_GET['route'] ?? ''), '/');
    $parts = $route === '' ? [] : explode('/', $route);
    $payload = body();

    if ($method === 'GET' && $route === 'habits') {
        $rows = $db->query("SELECT id, name, category, color, icon, created_at FROM habits WHERE archived = 0 ORDER BY CASE WHEN category = '' THEN 1 ELSE 0 END, lower(category), id")->fetchAll();
        respond(['habits' => $rows]);
    }

    if ($method === 'GET' && $route === 'categories') {
        respond(['categories' => $db->query('SELECT id, name, created_at FROM categories ORDER BY lower(name)')->fetchAll()]);
    }

    if ($method === 'GET' && $route === 'logs') {
        $start = (string) ($_GET['start'] ?? '');
        $end = (string) ($_GET['end'] ?? '');
        if (!$start || !$end) respond(['error' => 'start and end query parameters are required.'], 400);
        $stmt = $db->prepare('SELECT habit_id, log_date FROM habit_logs WHERE done = 1 AND log_date >= ? AND log_date <= ? ORDER BY log_date, habit_id');
        $stmt->execute([$start, $end]);
        $logs = [];
        foreach ($stmt->fetchAll() as $row) $logs[$row['log_date']][] = (int) $row['habit_id'];
        respond(['logs' => $logs]);
    }

    if ($method === 'POST' && $route === 'habits') {
        $name = clean_text($payload['name'] ?? null);
        $categoryName = clean_text($payload['category'] ?? null, '', 60);
        $color = clean_text($payload['color'] ?? null, '#8b5cf6', 20) ?: '#8b5cf6';
        $icon = clean_text($payload['icon'] ?? null, DEFAULT_ICON, 4) ?: DEFAULT_ICON;
        if (!$name) respond(['error' => 'Habit name is required.'], 400);
        if ($categoryName) {
            $known = $db->prepare('SELECT 1 FROM categories WHERE name = ?');
            $known->execute([$categoryName]);
            if (!$known->fetchColumn()) respond(['error' => 'Unknown category. Add it first.'], 400);
        }
        $stmt = $db->prepare('INSERT INTO habits(name, category, color, icon, created_at) VALUES (?, ?, ?, ?, ?)');
        $stmt->execute([$name, $categoryName, $color, $icon, utc_now()]);
        respond(['habit' => habit($db, (int) $db->lastInsertId())], 201);
    }

    if ($method === 'POST' && $route === 'categories') {
        $name = clean_text($payload['name'] ?? null, '', 60);
        if (!$name) respond(['error' => 'Category name is required.'], 400);
        try {
            $stmt = $db->prepare('INSERT INTO categories(name, created_at) VALUES (?, ?)');
            $stmt->execute([$name, utc_now()]);
        } catch (PDOException $e) {
            if ((string) $e->getCode() === '23000') respond(['error' => 'That category already exists.'], 409);
            throw $e;
        }
        respond(['category' => category($db, (int) $db->lastInsertId())], 201);
    }

    if ($method === 'POST' && $route === 'logs/toggle') {
        $habitId = filter_var($payload['habit_id'] ?? null, FILTER_VALIDATE_INT);
        $date = (string) ($payload['date'] ?? '');
        $validDate = DateTimeImmutable::createFromFormat('!Y-m-d', $date);
        if (!$habitId) respond(['error' => 'Valid habit_id is required.'], 400);
        if (!$validDate || $validDate->format('Y-m-d') !== $date) respond(['error' => 'date must be YYYY-MM-DD.'], 400);
        $stmt = $db->prepare('SELECT id FROM habits WHERE id = ? AND archived = 0');
        $stmt->execute([$habitId]);
        if (!$stmt->fetch()) respond(['error' => 'Habit not found.'], 404);
        $stmt = $db->prepare('SELECT id FROM habit_logs WHERE habit_id = ? AND log_date = ?');
        $stmt->execute([$habitId, $date]);
        $logId = $stmt->fetchColumn();
        if ($logId) {
            $stmt = $db->prepare('DELETE FROM habit_logs WHERE id = ?');
            $stmt->execute([$logId]);
            $done = false;
        } else {
            $stmt = $db->prepare('INSERT INTO habit_logs(habit_id, log_date, done, created_at) VALUES (?, ?, 1, ?)');
            $stmt->execute([$habitId, $date, utc_now()]);
            $done = true;
        }
        respond(['done' => $done, 'habit_id' => $habitId, 'date' => $date]);
    }

    if (count($parts) === 2 && in_array($method, ['PUT', 'PATCH'], true) && ctype_digit($parts[1])) {
        $id = (int) $parts[1];
        if ($parts[0] === 'habits') {
            $name = clean_text($payload['name'] ?? null);
            $categoryName = clean_text($payload['category'] ?? null, '', 60);
            $color = clean_text($payload['color'] ?? null, '#8b5cf6', 20) ?: '#8b5cf6';
            $icon = clean_text($payload['icon'] ?? null, DEFAULT_ICON, 4) ?: DEFAULT_ICON;
            if (!$name) respond(['error' => 'Habit name is required.'], 400);
            if ($categoryName) {
                $known = $db->prepare('SELECT 1 FROM categories WHERE name = ?');
                $known->execute([$categoryName]);
                if (!$known->fetchColumn()) respond(['error' => 'Unknown category. Add it first.'], 400);
            }
            $stmt = $db->prepare('UPDATE habits SET name = ?, category = ?, color = ?, icon = ? WHERE id = ? AND archived = 0');
            $stmt->execute([$name, $categoryName, $color, $icon, $id]);
            if (!$stmt->rowCount() && !habit($db, $id)) respond(['error' => 'Habit not found.'], 404);
            respond(['habit' => habit($db, $id)]);
        }
        if ($parts[0] === 'categories') {
            $name = clean_text($payload['name'] ?? null, '', 60);
            if (!$name) respond(['error' => 'Category name is required.'], 400);
            $old = category($db, $id);
            if (!$old) respond(['error' => 'Category not found.'], 404);
            try {
                $db->beginTransaction();
                $stmt = $db->prepare('UPDATE categories SET name = ? WHERE id = ?');
                $stmt->execute([$name, $id]);
                $stmt = $db->prepare('UPDATE habits SET category = ? WHERE category = ?');
                $stmt->execute([$name, $old['name']]);
                $db->commit();
            } catch (PDOException $e) {
                if ($db->inTransaction()) $db->rollBack();
                if ((string) $e->getCode() === '23000') respond(['error' => 'That category already exists.'], 409);
                throw $e;
            }
            respond(['category' => category($db, $id)]);
        }
    }

    if (count($parts) === 2 && $method === 'DELETE' && ctype_digit($parts[1])) {
        $id = (int) $parts[1];
        if ($parts[0] === 'habits') {
            $stmt = $db->prepare('DELETE FROM habits WHERE id = ?');
            $stmt->execute([$id]);
            if (!$stmt->rowCount()) respond(['error' => 'Habit not found.'], 404);
            respond(['ok' => true]);
        }
        if ($parts[0] === 'categories') {
            $old = category($db, $id);
            if (!$old) respond(['error' => 'Category not found.'], 404);
            $db->beginTransaction();
            $stmt = $db->prepare("UPDATE habits SET category = '' WHERE category = ?");
            $stmt->execute([$old['name']]);
            $stmt = $db->prepare('DELETE FROM categories WHERE id = ?');
            $stmt->execute([$id]);
            $db->commit();
            respond(['ok' => true]);
        }
    }

    respond(['error' => 'Not found.'], 404);
} catch (Throwable $e) {
    error_log($e->__toString());
    respond(['error' => 'Database unavailable. Check config.php and MySQL.'], 503);
}
