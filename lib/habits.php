<?php

declare(strict_types=1);

require_once __DIR__ . '/user_context.php';

function habits_active(PDO $db): array
{
    return $db->query("SELECT id, name, category, color, icon, created_at FROM habits WHERE user_id = " . life_os_user_id() . " AND archived = 0 ORDER BY CASE WHEN category = '' THEN 1 ELSE 0 END, lower(category), id")->fetchAll();
}

function habits_today(PDO $db, ?string $date = null): array
{
    $date ??= api_today();
    $query = $db->prepare('SELECT habit_id FROM habit_logs WHERE user_id = ' . life_os_user_id() . ' AND log_date = ? AND done = 1');
    $query->execute([$date]);
    $completed = array_map('strval', $query->fetchAll(PDO::FETCH_COLUMN));
    $habits = array_map(fn ($habit) => ['id' => (int) $habit['id'], 'name' => $habit['name'], 'category' => $habit['category'], 'done' => in_array((string) $habit['id'], $completed, true)], habits_active($db));
    return ['date' => $date, 'habits' => $habits];
}

function habits_set_completion(PDO $db, int $id, string $date, bool $done): array
{
    $db->beginTransaction();
    try {
        $mysql = $db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
        $query = $db->prepare('SELECT id FROM habits WHERE user_id = ' . life_os_user_id() . ' AND id = ? AND archived = 0' . ($mysql ? ' FOR UPDATE' : ''));
        $query->execute([$id]);
        if ($query->fetchColumn() === false) throw new ApiException(404, 'not_found', 'Active habit not found.');
        if ($done) {
            $query = $db->prepare($mysql
                ? 'INSERT INTO habit_logs (user_id, habit_id, log_date, done, created_at) VALUES (' . life_os_user_id() . ', ?, ?, 1, ?) ON DUPLICATE KEY UPDATE done = 1'
                : 'INSERT INTO habit_logs (user_id, habit_id, log_date, done, created_at) VALUES (' . life_os_user_id() . ', ?, ?, 1, ?) ON CONFLICT(habit_id, log_date) DO UPDATE SET done = 1');
            $query->execute([$id, $date, gmdate('Y-m-d\TH:i:s\Z')]);
        } else {
            $query = $db->prepare('DELETE FROM habit_logs WHERE user_id = ' . life_os_user_id() . ' AND habit_id = ? AND log_date = ?');
            $query->execute([$id, $date]);
        }
        $db->commit();
        return ['habit_id' => $id, 'date' => $date, 'done' => $done];
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
}

function habits_api(PDO $db, string $method, ?string $id, string $action, array $body): array
{
    if ($id === null) { api_method(['GET'], $method); return $action === 'today' ? habits_today($db) : habits_active($db); }
    api_method(['POST', 'DELETE'], $method);
    if (!ctype_digit($id) || (int) $id < 1) throw new ApiException(422, 'validation_error', 'Habit id must be a positive integer.');
    api_fields($body, ['date']);
    $date = api_date($body['date'] ?? api_today(), 'date');
    if ($date === null) throw new ApiException(422, 'validation_error', 'date must be a real ISO date.');
    return habits_set_completion($db, (int) $id, $date, $method === 'POST');
}
