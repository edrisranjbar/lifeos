<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/api_auth.php';
require_once dirname(__DIR__) . '/lib/api_router.php';

// No config.php is loaded. By default this suite uses an in-memory SQLite fixture.
$db = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$db->exec('CREATE TABLE app_state (user_id INTEGER NOT NULL DEFAULT 1, state_key TEXT NOT NULL, state_value TEXT NOT NULL, PRIMARY KEY (user_id, state_key))');
$db->exec('CREATE TABLE habits (id INTEGER PRIMARY KEY, name TEXT, category TEXT, color TEXT, icon TEXT, created_at TEXT, archived INTEGER DEFAULT 0, user_id INTEGER NOT NULL DEFAULT 1)');
$db->exec('CREATE TABLE habit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, habit_id INTEGER, log_date TEXT, done INTEGER, created_at TEXT, user_id INTEGER NOT NULL DEFAULT 1, UNIQUE(habit_id, log_date))');
$db->exec("INSERT INTO habits (id, name, category, color, icon, created_at, archived) VALUES (1, 'Reading', 'Learning', '#fff', '✓', '2026-01-01', 0), (2, 'Archived', '', '', '', '', 1)");
$store = new StateStore($db);
$checks = 0;
function check(bool $condition, string $label): void { global $checks; if (!$condition) throw new RuntimeException('FAIL: ' . $label); $checks++; }
function fails(callable $action, int $status, string $label): void {
    try { $action(); } catch (ApiException $error) { check($error->status === $status, $label); return; }
    throw new RuntimeException('FAIL: expected error: ' . $label);
}
function request(string $method, string $path, array $body = [], array $query = [], array $config = []): mixed {
    global $db; return api_dispatch($db, $method, $path, $body, $query, $config)[0];
}
function seed(string $key, array $data): void { global $store; $store->mutate([$key => []], function (array &$docs) use ($key, $data) { $docs[$key] = $data; }); }

$token = str_repeat('a', 64);
check(!api_token_valid('', $token), 'missing token');
check(!api_token_valid('Bearer wrong', $token), 'wrong token');
check(api_token_valid('Bearer ' . $token, $token), 'valid token');
check(!api_token_valid('Bearer replace-with-a-long-random-token', 'replace-with-a-long-random-token'), 'placeholder disabled');
putenv('LIFEOS_API_TOKEN=' . str_repeat('b', 64));
check(api_configured_token(['api_token' => $token]) === str_repeat('b', 64), 'environment takes precedence');
putenv('LIFEOS_API_TOKEN');
check(api_configured_token(['api_token' => $token]) === $token, 'config fallback');
fails(fn () => api_decode_body('{oops'), 400, 'malformed payload');
fails(fn () => api_decode_body('[]'), 400, 'array body rejected');
fails(fn () => api_decode_body(str_repeat('a', 1000001)), 413, 'body size bounded');
check(api_decode_body('{"title":"hello"}')['title'] === 'hello', 'valid body');
seed('fixture', ['number' => 1, 'unknown' => ['preserve' => true]]);
check($store->get('fixture', [])['number'] === 1, 'valid stored JSON');
$store->mutate(['fixture' => []], function (array &$docs) { $docs['fixture']['number']++; });
check($store->get('fixture', [])['number'] === 2, 'atomic mutation');
$db->exec('INSERT INTO app_state (state_key, state_value) VALUES (\'object_fixture\', \'{"count":0,"unknown":{},"numeric":{"0":"zero"}}\')');
$store->mutate(['object_fixture' => []], function (array &$docs) { $docs['object_fixture']['count']++; });
$object = json_decode($store->raw('object_fixture'));
check($object->unknown instanceof stdClass && $object->numeric instanceof stdClass, 'unknown JSON object containers preserved');
$store->mutate(['unused_document' => ['items' => []]], function (array &$docs) {});
check($store->raw('unused_document') === null, 'unchanged absent document is not invented');
try { $store->mutate(['fixture' => []], function (array &$docs) { $docs['fixture']['number'] = 999; throw new RuntimeException('rollback'); }); } catch (RuntimeException) {}
check($store->get('fixture', [])['number'] === 2, 'rollback preserves document');
$revision = hash('sha256', $store->raw('fixture'));
$store->compareAndSwap('fixture', '{"number":3}', $revision);
fails(fn () => $store->compareAndSwap('fixture', '{"number":4}', $revision), 409, 'stale whole-document save blocked');
$store->compareAndSwap('new', '{}', null);
fails(fn () => $store->compareAndSwap('new', '{}', null), 409, 'missing-row race blocked');
fails(fn () => request('POST', 'goals', ['title' => '']), 422, 'goal title required');
fails(fn () => request('POST', 'goals', ['title' => 'A', 'deadline' => '2026-02-30']), 422, 'invalid date');
fails(fn () => request('POST', 'goals', ['title' => 'A', 'priority' => 'urgent']), 422, 'priority validation');
$goal = request('POST', 'goals', ['title' => 'Studio', 'deadline' => '2027-01-07', 'measures' => [['metric' => 'Score', 'target' => 8, 'unit' => '/10', 'current' => 0]], 'tasks' => [['title' => 'Repair walls']]]);
check(strlen($goal['id']) === 36 && strlen($goal['tasks'][0]['id']) === 36, 'goal and nested UUIDs generated');
check($goal['metric'] === 'Score' && $goal['target'] === 8, 'legacy measure mirror');
check(count(request('GET', 'goals')) === 1, 'goals list');
$goalId = $goal['id'];
$store->mutate([GOALS_KEY => []], function (array &$docs) { $docs[GOALS_KEY]['unknown'] = true; $docs[GOALS_KEY]['goals'][0]['unknown'] = 'keep'; $docs[GOALS_KEY]['goals'][0]['tasks'][0]['unknown'] = 42; });
$updated = request('PATCH', 'goals/' . $goalId, ['title' => 'Home studio']);
check($updated['unknown'] === 'keep' && $updated['tasks'][0]['unknown'] === 42, 'goal patch preserves unknown fields');
check($store->get(GOALS_KEY, [])['unknown'] === true, 'document metadata preserved');
request('PATCH', 'goals/' . $goalId, ['tasks' => [['id' => $goal['tasks'][0]['id'], 'title' => 'Repair walls now']]]);
check(request('GET', 'goals/' . $goalId)['tasks'][0]['unknown'] === 42, 'nested patch preserves unknown fields');
$task = request('POST', 'tasks', ['source' => 'goal', 'goal_id' => $goalId, 'title' => 'Buy panels']);
check($task['due_date'] === '2027-01-07', 'goal task inherits deadline');
check(request('POST', 'tasks/' . $task['id'] . '/complete')['done'], 'goal task completion');
check(request('PATCH', 'tasks/' . $task['id'], ['done' => false, 'priority' => 'high'])['priority'] === 'high', 'task update');
seed(KANBAN_KEY, ['activeBoardId' => 'board', 'unknown' => 42, 'boards' => [['id' => 'board', 'columns' => [['id' => 'todo', 'name' => 'To Do', 'cards' => []], ['id' => 'done', 'name' => ' Completed ', 'cards' => []]]], ['id' => 'no-done', 'columns' => [['id' => 'open', 'name' => 'Open', 'cards' => []]]]]]);
$card = request('POST', 'tasks', ['source' => 'kanban', 'board_id' => 'board', 'column_id' => 'todo', 'title' => 'Deploy API', 'description' => 'Details', 'due_date' => api_today()]);
$completed = request('POST', 'tasks/' . $card['id'] . '/complete');
check($completed['done'] && $completed['column_id'] === 'done', 'kanban move to complete column');
check($store->get(KANBAN_KEY, [])['boards'][0]['columns'][1]['cards'][0]['completed'] === true, 'card UI completion flag synchronized');
check(request('POST', 'tasks/' . $card['id'] . '/complete')['done'], 'kanban completion idempotent');
check(!request('PATCH', 'tasks/' . $card['id'], ['done' => false, 'column_id' => 'todo'])['done'], 'kanban reopen explicit column');
$noDone = request('POST', 'tasks', ['source' => 'kanban', 'board_id' => 'no-done', 'column_id' => 'open', 'title' => 'Wait']);
fails(fn () => request('POST', 'tasks/' . $noDone['id'] . '/complete'), 409, 'no done column conflict');
check(count(request('GET', 'tasks', [], ['source' => 'kanban'])) === 2, 'task source filtering');
check(count(request('GET', 'habits')) === 1, 'archived habits excluded');
request('POST', 'habits/1/complete'); request('POST', 'habits/1/complete');
check((int) $db->query('SELECT COUNT(*) FROM habit_logs')->fetchColumn() === 1, 'habit completion idempotent');
check(request('GET', 'habits/today')['habits'][0]['done'], 'today habit completed');
request('DELETE', 'habits/1/complete'); request('DELETE', 'habits/1/complete');
check(!request('GET', 'habits/today')['habits'][0]['done'], 'habit uncomplete idempotent');
fails(fn () => request('POST', 'habits/2/complete'), 404, 'archived completion rejected');
seed(FINANCE_KEY, ['Oct 2026' => ['incomes' => [], 'expenses' => [], 'categories' => [['id' => 'food', 'label' => 'Food', 'target' => 1000]], 'unknown' => 'keep']]);
$expense = request('POST', 'finance/expenses', ['category_id' => 'food', 'amount' => 450, 'description' => 'Dinner', 'date' => '2026-10-07']);
check($expense['date'] === 'Oct 7' && $expense['desc'] === 'Dinner' && $expense['categoryId'] === 'food', 'expense UI shape');
request('POST', 'finance/incomes', ['name' => 'Air Shoes', 'amount' => 1000]);
request('POST', 'finance/incomes', ['name' => 'Air Shoes', 'amount' => 2000]);
check(count(request('GET', 'finance/incomes')) === 1, 'income same generated id updates');
$summary = request('GET', 'finance');
check($summary['balance'] === 1550 && $summary['budget_remaining'] === 550, 'finance totals');
check($store->get(FINANCE_KEY, [])['Oct 2026']['unknown'] === 'keep', 'finance metadata preserved');
check($store->get(FINANCE_LEGACY_KEY, [])['expenses'][0]['id'] === $expense['id'], 'active legacy state synchronized');
fails(fn () => request('POST', 'finance/expenses', ['category_id' => 'missing', 'amount' => 1]), 422, 'unknown category');
fails(fn () => request('POST', 'finance/expenses', ['category_id' => 'food', 'amount' => 0]), 422, 'positive amount');
fails(fn () => request('GET', 'finance', [], ['period' => 'missing']), 404, 'missing period');
$note = request('POST', 'notes', ['title' => 'Studio Ideas', 'body' => 'Acoustic panels', 'color' => 'blue']);
check($note['w'] === 220 && $note['fontSize'] === 14 && !$note['secret'], 'note frontend defaults');
$hidden = request('POST', 'notes', ['title' => 'Secret', 'body' => 'private', 'secret' => true]);
check(!isset($hidden['body']), 'secret creation response redacted');
check(count(request('GET', 'notes')) === 1, 'secret notes excluded');
fails(fn () => request('GET', 'notes/' . $hidden['id']), 404, 'secret direct lookup hidden');
fails(fn () => request('PATCH', 'notes/' . $hidden['id'], ['secret' => false]), 404, 'secret mutation hidden');
fails(fn () => request('GET', 'notes', [], ['include_secret' => '1']), 403, 'secret access config gate');
check(count(request('GET', 'notes', [], ['include_secret' => '1'], ['api_allow_secret_notes' => true])) === 2, 'explicit secret opt-in');
request('PATCH', 'notes/' . $note['id'], ['body' => 'Updated']);
$store->mutate([NOTES_KEY => []], function (array &$docs) use ($note, $hidden) { $docs[NOTES_KEY]['connections'][] = ['a' => $note['id'], 'b' => $hidden['id']]; });
check(request('DELETE', 'notes/' . $note['id'])['deleted'], 'note delete');
check($store->get(NOTES_KEY, [])['connections'] === [], 'note connections removed');
check(request('GET', 'dashboard')['recent_notes'] === [], 'dashboard secret notes excluded');
check(request('DELETE', 'tasks/' . $task['id'])['deleted'], 'task delete');
check(request('DELETE', 'goals/' . $goalId)['deleted'], 'goal delete');
fails(fn () => request('GET', 'goals/' . $goalId), 404, 'deleted goal missing');
fails(fn () => request('PUT', 'goals'), 405, 'method not allowed');
fails(fn () => request('GET', 'credentials'), 404, 'no credential route');

// A second account sees none of the first account's documents or habits.
$ownerNotes = $store->raw(NOTES_KEY);
$GLOBALS['life_os_request_user_id'] = 2;
check($store->raw(NOTES_KEY) === null, 'second account starts without the owner notes');
check(habits_active($db) === [], 'second account sees no owner habits');
fails(fn () => request('POST', 'habits/1/complete'), 404, 'second account cannot complete an owner habit');
request('POST', 'notes', ['title' => 'Second account note']);
check(count($store->get(NOTES_KEY, ['notes' => []])['notes']) === 1, 'second account writes its own notes document');
$GLOBALS['life_os_request_user_id'] = 1;
check($store->raw(NOTES_KEY) === $ownerNotes, 'owner notes unchanged by the second account');
echo "PASS: $checks isolated API assertions\n";
