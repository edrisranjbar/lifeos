<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/api_router.php';
require_once dirname(__DIR__) . '/lib/obligations.php';

// Debts and credits against an in-memory SQLite fixture; no config.php is loaded.
$db = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$db->exec('CREATE TABLE app_state (user_id INTEGER NOT NULL DEFAULT 1, state_key TEXT NOT NULL, state_value TEXT NOT NULL, PRIMARY KEY (user_id, state_key))');
$store = new StateStore($db);
$checks = 0;
function check(bool $condition, string $label): void { global $checks; if (!$condition) throw new RuntimeException('FAIL: ' . $label); $checks++; }
function fails(callable $action, int $status, string $label): void {
    try { $action(); } catch (ApiException $error) { check($error->status === $status, $label . ' (got ' . $error->status . ')'); return; }
    throw new RuntimeException('FAIL: expected error: ' . $label);
}
// Send the revisions this client last saw, as the browser does.
function act(array $body): mixed {
    global $store;
    $revisions = [];
    foreach ([OBLIGATIONS_KEY, FINANCE_KEY, FINANCE_LEGACY_KEY] as $key) { $raw = $store->raw($key); $revisions[$key] = $raw === null ? null : hash('sha256', $raw); }
    return obligation_mutate($store, $body + ['revisions' => $revisions])['result'];
}
function view(string $month): array {
    global $store;
    $end = (new DateTimeImmutable($month . '-01'))->modify('last day of this month')->format('Y-m-d');
    return obligation_view($store->get(OBLIGATIONS_KEY, obligations_default()), finance_periods($store), $month . '-01', $end);
}
function ledger(): array { global $store; return $store->get(FINANCE_KEY, [])['Current']; }

$store->mutate([FINANCE_KEY => []], function (array &$docs) {
    $docs[FINANCE_KEY] = ['Current' => ['categories' => [['id' => 'bills', 'label' => 'Bills', 'target' => 0]], 'expenses' => [], 'incomes' => [['id' => 'salary', 'name' => 'Salary', 'amount' => 900]]]];
});
$today = api_today();
$month = substr($today, 0, 7);

// One-time debt: a single due for the full amount, counted as money you owe.
$debt = act(['action' => 'create', 'plan' => ['title' => 'Repay Ali', 'type' => 'once', 'direction' => 'debt', 'amount' => 500, 'startDate' => $today]]);
check($debt['count'] === 1 && $debt['totalAmount'] === 500 && $debt['direction'] === 'debt', 'one-time debt stored as a single finite due');

// Recurring credit: someone pays you every month.
$credit = act(['action' => 'create', 'plan' => ['title' => 'Rent from tenant', 'payee' => 'Tenant', 'type' => 'recurring', 'direction' => 'credit', 'amount' => 300, 'startDate' => $today, 'frequency' => 'monthly', 'interval' => 1]]);
check($credit['direction'] === 'credit', 'credit direction stored');

$v = view($month);
check($v['totals']['committed'] === 500, 'debt totals hold only debts');
check($v['creditTotals']['committed'] === 300, 'credit totals hold only credits');
$creditDue = array_values(array_filter($v['occurrences'], fn ($o) => $o['direction'] === 'credit'))[0];
check($creditDue['amount'] === 300 && $creditDue['date'] === $today, 'credit due generated');

// Receiving a credit adds income, not an expense.
act(['action' => 'pay', 'occurrenceId' => $creditDue['id'], 'period' => 'Current', 'paymentDate' => $today]);
$incomes = ledger()['incomes'];
check(count($incomes) === 2 && end($incomes)['amount'] === 300 && end($incomes)['obligationId'] === $creditDue['id'], 'receipt creates an income entry');
check(ledger()['expenses'] === [], 'receipt creates no expense');
$v = view($month);
check($v['creditTotals']['paid'] === 300 && $v['creditTotals']['remaining'] === 0, 'credit counted as received');
check($v['totals']['paid'] === 0, 'debt totals unaffected by receipts');

// Deleting a plan with a recorded receipt is refused; undo first.
fails(fn () => act(['action' => 'delete', 'planId' => $credit['id']]), 409, 'delete blocked while payments are recorded');
act(['action' => 'undo', 'occurrenceId' => $creditDue['id']]);
check(count(ledger()['incomes']) === 1, 'undo removes the created income');

// Linking an existing income requires the exact amount.
fails(fn () => act(['action' => 'pay', 'occurrenceId' => $creditDue['id'], 'period' => 'Current', 'incomeId' => 'salary', 'paymentDate' => $today]), 422, 'income link needs exact amount');

// Paying a debt still creates an expense.
$debtDue = array_values(array_filter(view($month)['occurrences'], fn ($o) => $o['planId'] === $debt['id']))[0];
act(['action' => 'pay', 'occurrenceId' => $debtDue['id'], 'period' => 'Current', 'categoryId' => 'bills', 'paymentDate' => $today]);
check(count(ledger()['expenses']) === 1 && ledger()['expenses'][0]['amount'] === 500, 'debt payment creates an expense');
check(view($month)['totals']['paid'] === 500, 'debt counted as paid');

// Optional skips are only for recurring payments you owe.
fails(fn () => act(['action' => 'create', 'plan' => ['title' => 'Maybe', 'type' => 'recurring', 'direction' => 'credit', 'optional' => true, 'amount' => 10, 'startDate' => $today]]), 422, 'optional credit rejected');
fails(fn () => act(['action' => 'create', 'plan' => ['title' => 'Once', 'type' => 'once', 'optional' => true, 'amount' => 10, 'startDate' => $today]]), 422, 'optional one-time rejected');

// Split credit: a total received across several payments.
$split = act(['action' => 'create', 'plan' => ['title' => 'Loan to Sara', 'type' => 'installment', 'direction' => 'credit', 'totalAmount' => 1000, 'count' => 3, 'startDate' => $today, 'frequency' => 'monthly', 'interval' => 1]]);
check($split['totalAmount'] === 1000 && $split['count'] === 3, 'split credit stored');
$progress = array_values(array_filter(view($month)['plans'], fn ($p) => $p['id'] === $split['id']))[0]['progress'];
check($progress['remaining'] === 1000, 'split credit progress starts at the full amount');

// Rename keeps terms; delete removes plans without payments.
$renamed = act(['action' => 'update', 'planId' => $credit['id'], 'plan' => ['title' => 'Apartment rent', 'payee' => 'Reza']]);
check($renamed['title'] === 'Apartment rent' && $renamed['amount'] === 300, 'rename keeps amount');
fails(fn () => act(['action' => 'update', 'planId' => $credit['id'], 'plan' => ['amount' => 1]]), 422, 'amount cannot be edited');
act(['action' => 'delete', 'planId' => $credit['id']]);
check(!array_filter(view($month)['plans'], fn ($p) => $p['id'] === $credit['id']), 'plan deleted');

// Deleting the last plan with decisions must leave a readable, writable document.
$solo = act(['action' => 'create', 'plan' => ['title' => 'Solo', 'type' => 'once', 'amount' => 5, 'startDate' => $today]]);
$soloDue = array_values(array_filter(view($month)['occurrences'], fn ($o) => $o['planId'] === $solo['id']))[0];
act(['action' => 'reject', 'occurrenceId' => $soloDue['id']]);
$store->mutate([OBLIGATIONS_KEY => obligations_default()], function (array &$docs) use ($solo) {
    // Keep only this plan's decision so the delete empties the decisions object.
    $docs[OBLIGATIONS_KEY]['decisions'] = array_filter($docs[OBLIGATIONS_KEY]['decisions'], fn ($key) => str_starts_with((string) $key, $solo['id']), ARRAY_FILTER_USE_KEY);
});
act(['action' => 'delete', 'planId' => $solo['id']]);
check(is_array(view($month)['occurrences']), 'view works after decisions become empty');
check(act(['action' => 'create', 'plan' => ['title' => 'After', 'type' => 'once', 'amount' => 5, 'startDate' => $today]])['title'] === 'After', 'writes work after decisions become empty');

// Plans saved before directions existed behave as debts.
$store->mutate([OBLIGATIONS_KEY => obligations_default()], function (array &$docs) use ($today) {
    $docs[OBLIGATIONS_KEY]['plans'][] = ['id' => '00000000-0000-4000-8000-000000000001', 'title' => 'Legacy internet', 'payee' => '', 'type' => 'recurring', 'optional' => false, 'amount' => 70, 'totalAmount' => null, 'count' => null, 'startDate' => $today, 'endDate' => null, 'frequency' => 'monthly', 'interval' => 1, 'notes' => '', 'createdAt' => $today, 'cancelFrom' => null];
});
$legacy = array_values(array_filter(view($month)['occurrences'], fn ($o) => $o['planId'] === '00000000-0000-4000-8000-000000000001'))[0];
check($legacy['direction'] === 'debt', 'legacy plan reads as a debt');
check(view($month)['totals']['committed'] === 575, 'legacy plan counted with debts');

// Totals beyond the viewed month: a credit due next month still counts as owed to you.
$fresh = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$fresh->exec('CREATE TABLE app_state (user_id INTEGER NOT NULL DEFAULT 1, state_key TEXT NOT NULL, state_value TEXT NOT NULL, PRIMARY KEY (user_id, state_key))');
$store = new StateStore($fresh);
$nextMonth = (new DateTimeImmutable($month . '-01'))->modify('+1 month');
$server = act(['action' => 'create', 'plan' => ['title' => 'Server', 'payee' => 'Saeed', 'type' => 'once', 'direction' => 'credit', 'amount' => 2200, 'startDate' => $nextMonth->modify('+1 day')->format('Y-m-d')]]);
act(['action' => 'create', 'plan' => ['title' => 'Far away', 'type' => 'once', 'direction' => 'credit', 'amount' => 300, 'startDate' => $nextMonth->modify('+4 months')->format('Y-m-d')]]);
$rent = act(['action' => 'create', 'plan' => ['title' => 'Rent in', 'type' => 'recurring', 'direction' => 'credit', 'amount' => 1000, 'startDate' => $month . '-01', 'frequency' => 'monthly']]);
act(['action' => 'create', 'plan' => ['title' => 'Phone', 'type' => 'recurring', 'direction' => 'debt', 'amount' => 50, 'startDate' => $month . '-01', 'frequency' => 'monthly', 'count' => 3]]);
$v = view($month);
check($v['creditTotals']['later'] === 2500, 'credits due after this month are totalled');
check($v['creditTotals']['openEnded'] === 1, 'open-ended credits are counted, not summed');
check($v['totals']['later'] === 100 && $v['totals']['openEnded'] === 0, 'remaining fixed-count debts are totalled');
check(!in_array($server['id'], array_column($v['occurrences'], 'planId'), true), 'month list keeps only this month');
$coming = array_column(array_filter($v['upcoming'], fn ($o) => $o['direction'] === 'credit'), 'title');
check(in_array('Server', $coming, true) && !in_array('Far away', $coming, true), 'upcoming lists the next six weeks only');
check(in_array('Rent in', $coming, true), 'open-ended plans appear in upcoming');
$plans = array_column($v['plans'], null, 'id');
check($plans[$server['id']]['nextDue']['date'] === $nextMonth->modify('+1 day')->format('Y-m-d') && $plans[$server['id']]['nextDue']['amount'] === 2200, 'plan shows its next due');
act(['action' => 'cancel', 'planId' => $rent['id'], 'cancelFrom' => $nextMonth->modify('+2 months')->format('Y-m-d')]);
check(view($month)['creditTotals']['later'] === 4500 && view($month)['creditTotals']['openEnded'] === 0, 'stopped plan totals only the dues before it stops');

echo "obligations_test: $checks checks passed\n";
