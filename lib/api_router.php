<?php

declare(strict_types=1);

require_once __DIR__ . '/state_store.php';
foreach (['goals', 'tasks', 'habits', 'finance', 'notes', 'notepad'] as $domain) require_once __DIR__ . '/' . $domain . '.php';

function api_dashboard(StateStore $store, PDO $db): array
{
    $today = api_today();
    $goals = $store->get(GOALS_KEY, ['goals' => []])['goals'];
    $counts = ['active' => 0, 'completed' => 0, 'overdue' => 0];
    foreach ($goals as $goal) {
        $status = goals_status($goal, $db);
        if (isset($counts[$status])) $counts[$status]++;
        if ($status === 'active' && !empty($goal['deadline']) && $goal['deadline'] < $today) $counts['overdue']++;
    }
    $tasks = tasks_aggregate(['goals' => $goals], $store->get(KANBAN_KEY, ['boards' => []]));
    $taskCounts = ['open' => 0, 'overdue' => 0, 'due_today' => 0];
    foreach ($tasks as $task) if (!$task['done']) {
        $taskCounts['open']++;
        if (!empty($task['due_date']) && $task['due_date'] < $today) $taskCounts['overdue']++;
        if ($task['due_date'] === $today) $taskCounts['due_today']++;
    }
    $habits = habits_today($db)['habits'];
    $notes = array_values(array_filter($store->get(NOTES_KEY, ['notes' => []])['notes'], fn ($note) => notes_visible($note, false, false)));
    usort($notes, fn ($a, $b) => ($b['updated'] ?? 0) <=> ($a['updated'] ?? 0));
    $recent = array_map(fn ($note) => ['id' => $note['id'], 'title' => $note['title'], 'preview' => mb_substr($note['body'] ?? '', 0, 180), 'updated' => $note['updated'] ?? null], array_slice($notes, 0, 5));
    $finance = finance_summary($store);
    return ['today' => $today, 'timezone' => 'Asia/Tehran', 'goals' => $counts, 'tasks' => $taskCounts, 'habits' => ['completed_today' => count(array_filter($habits, fn ($habit) => $habit['done'])), 'total_today' => count($habits)], 'finance' => array_intersect_key($finance, array_flip(['active_period', 'income_total', 'expense_total', 'balance'])), 'recent_notes' => $recent];
}

/** Returns [payload, status]; authentication is handled once by the entry point. */
function api_dispatch(PDO $db, string $method, string $path, array $body = [], array $query = [], array $config = []): array
{
    $store = new StateStore($db);
    $parts = explode('/', trim($path, '/'));
    $resource = $parts[0];
    $id = $parts[1] ?? null;
    $action = $parts[2] ?? '';
    if (count($parts) > 3) throw new ApiException(404, 'not_found', 'API route not found.');
    foreach ($query as $key => $value) if (!is_string($value)) throw new ApiException(422, 'validation_error', 'Query values must be strings.');
    if ($resource === 'health' && $id === null) { api_method(['GET'], $method); return [['ok' => true, 'version' => 1], 200]; }
    if ($resource === 'dashboard' && $id === null) { api_method(['GET'], $method); return [api_dashboard($store, $db), 200]; }
    $status = $method === 'POST' && $action === '' && !in_array($resource, ['habits'], true) ? 201 : 200;
    if ($resource === 'goals' && $action === '') return [goals_api($store, $method, $id, $body, $db), $status];
    if ($resource === 'tasks' && ($action === '' || ($id !== null && $action === 'complete'))) {
        if ($action === 'complete') api_fields($body, []);
        return [tasks_api($store, $method, $id, $action === 'complete', $body, $query), $status];
    }
    if ($resource === 'habits' && (($id === null || $id === 'today') && $action === '' || $id !== null && $action === 'complete')) return [habits_api($db, $method, $id === 'today' ? null : $id, $id === 'today' ? 'today' : $action, $body), 200];
    if ($resource === 'finance' && $action === '' && ($id === null || in_array($id, ['expenses', 'incomes'], true))) return [finance_api($store, $method, $id ?? '', $body, $query), $status];
    if ($resource === 'notepad' && $action === '') return [notepad_api($store, $method, $id, $body), $status];
    if ($resource === 'notes' && $action === '') return [notes_api($store, $method, $id, $body, ($query['include_secret'] ?? '') === '1', ($config['api_allow_secret_notes'] ?? false) === true), $status];
    throw new ApiException(404, 'not_found', 'API route not found.');
}
