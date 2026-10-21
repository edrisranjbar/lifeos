<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/api_router.php';
require_once dirname(__DIR__) . '/lib/kanban_goal.php';

// Moving a Kanban card to Goals against an in-memory SQLite fixture; no config.php is loaded.
$db = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$db->exec('CREATE TABLE app_state (user_id INTEGER NOT NULL DEFAULT 1, state_key TEXT NOT NULL, state_value TEXT NOT NULL, PRIMARY KEY (user_id, state_key))');
$db->exec('CREATE TABLE card_attachments (attachment_id TEXT PRIMARY KEY, board_id TEXT NOT NULL, card_id TEXT NOT NULL, filename TEXT NOT NULL, byte_size INTEGER NOT NULL, user_id INTEGER NOT NULL DEFAULT 1)');
$store = new StateStore($db);
$checks = 0;
function check(bool $condition, string $label): void { global $checks; if (!$condition) throw new RuntimeException('FAIL: ' . $label); $checks++; }
function fails(callable $action, int $status, string $label): void {
    try { $action(); } catch (ApiException $error) { check($error->status === $status, $label . ' (got ' . $error->status . ')'); return; }
    throw new RuntimeException('FAIL: expected error: ' . $label);
}
// Send the revisions this client last saw, as the browser does.
function revisions(): array {
    global $store;
    $revisions = [];
    foreach (['kanban_boards_v1', GOALS_KEY] as $key) { $raw = $store->raw($key); $revisions[$key] = $raw === null ? null : hash('sha256', $raw); }
    return $revisions;
}
function move(string $cardId, ?array $revisions = null): array {
    global $store, $db;
    return kanban_card_to_goal($store, $db, ['action' => 'to_goal', 'board_id' => 'b1', 'column_id' => 'todo', 'card_id' => $cardId, 'revisions' => $revisions ?? revisions()]);
}
function cards(): array { global $store; return array_column($store->get('kanban_boards_v1', [])['boards'][0]['columns'][0]['cards'], 'id'); }

$store->mutate(['kanban_boards_v1' => []], function (array &$docs) {
    $docs['kanban_boards_v1'] = ['activeBoardId' => 'b1', 'boards' => [['id' => 'b1', 'name' => 'Life', 'labelDefs' => [['id' => 'l1', 'name' => 'Health', 'color' => '#16a34a']], 'columns' => [['id' => 'todo', 'name' => 'To Do', 'cards' => [
        ['id' => 'c1', 'title' => 'Run a half marathon', 'description' => 'Under two hours', 'priority' => 'high', 'dueDate' => '2026-12-20', 'startDate' => '2026-11-01', 'labelIds' => ['l1'],
            'checklists' => [['id' => 'k1', 'title' => 'Plan', 'items' => [['id' => 'i1', 'text' => 'Buy shoes', 'done' => true], ['id' => 'i2', 'text' => ' ', 'done' => false]]], ['id' => 'k2', 'title' => 'Train', 'items' => [['id' => 'i3', 'text' => 'Run 10 km', 'done' => false]]]]],
        ['id' => 'c2', 'title' => 'Legacy card', 'dueDate' => '2026-02-30', 'checklist' => [['id' => 'i4', 'text' => 'Old item', 'done' => false]]],
        ['id' => 'c3', 'title' => 'Has a file', 'checklist' => []],
    ]]]]]];
});

// A full card becomes a checklist goal and leaves its list.
$result = move('c1');
$goal = $store->get(GOALS_KEY, [])['goals'][0];
check($result['result']['goalId'] === $goal['id'] && $result['result']['title'] === 'Run a half marathon', 'result names the new goal');
check($goal['specific'] === 'Under two hours' && $goal['priority'] === 'high' && $goal['progressSource'] === 'checklist', 'description and priority carried over');
check($goal['deadline'] === '2026-12-20' && $goal['startDate'] === '2026-11-01', 'dates carried over');
check(array_map(fn ($t) => [$t['title'], $t['done']], $goal['tasks']) === [['Buy shoes', true], ['Run 10 km', false]], 'checklist items from every list become tasks; blank items dropped');
check(str_contains($goal['notes'], 'Life → To Do') && str_contains($goal['notes'], 'Labels: Health'), 'origin and labels kept in notes');
check(cards() === ['c2', 'c3'], 'card removed from the board');
check(isset($result['updates']['kanban_boards_v1'], $result['updates'][GOALS_KEY]), 'both documents returned to the client');
check($result['updates'][GOALS_KEY]['revision'] === hash('sha256', $store->raw(GOALS_KEY)), 'returned revision matches the stored goals');

// Legacy flat checklists work, and an impossible date is dropped instead of failing the move.
move('c2');
$legacy = $store->get(GOALS_KEY, [])['goals'][1];
check($legacy['tasks'][0]['title'] === 'Old item' && $legacy['deadline'] === null, 'legacy checklist moved, bad date dropped');

// Cards with attachments stay put, because goals cannot hold files.
$db->exec("INSERT INTO card_attachments VALUES ('" . str_repeat('a', 32) . "', 'b1', 'c3', 'plan.pdf', 10, 1)");
fails(fn () => move('c3'), 409, 'attachments block the move');
check(cards() === ['c3'] && count($store->get(GOALS_KEY, [])['goals']) === 2, 'blocked move changed nothing');
$db->exec('DELETE FROM card_attachments');

// Stale revisions, missing cards and missing revisions are refused.
$stale = revisions();
$stale[GOALS_KEY] = str_repeat('0', 64);
fails(fn () => move('c3', $stale), 409, 'stale goals revision is a conflict');
fails(fn () => move('missing'), 404, 'unknown card');
fails(fn () => move('c3', [GOALS_KEY => null]), 422, 'board revision required');
check(cards() === ['c3'], 'refused moves changed nothing');

echo "kanban goal checks passed: $checks\n";
