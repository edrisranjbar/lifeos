<?php

declare(strict_types=1);

const FINANCE_KEY = 'daramd_periods_v1';
const FINANCE_LEGACY_KEY = 'daramd_v1';

function finance_default(): array
{
    // Same defaults as the browser; used only when no finance state exists yet.
    $labels = [
        ['food', '🛒 Food & Drinks', 6000000], ['family', '👨‍👩‍👧 Family', 5000000],
        ['housing', '🏗️ Housing & Construction', 5000000], ['work', '💼 Work & Growth', 2000000],
        ['project', '💻 Project Expenses', 5000000], ['saving', '💰 Saving & Investment', 2227196],
        ['transport', '🚗 Transportation', 500000], ['loans', '🏦 Loans & Debts', 5000000],
        ['bills', '📡 Bills, Internet, VPN', 1000000], ['clothing', '👕 Clothing', 1000000],
        ['charity', '🕌 Charity & Donation', 500000], ['health', '💊 Health & Beauty', 500000],
    ];
    return ['incomes' => [], 'expenses' => [], 'categories' => array_map(fn ($row) => ['id' => $row[0], 'label' => $row[1], 'target' => $row[2]], $labels)];
}

function finance_periods(StateStore $store): array
{
    $periods = $store->get(FINANCE_KEY, []);
    return $periods ?: ['Current' => $store->get(FINANCE_LEGACY_KEY, finance_default())];
}

function finance_active(StateStore $store, array $periods): string
{
    $active = $store->raw('daramd_active_period_v1') ?? 'Current';
    return array_key_exists($active, $periods) ? $active : (string) array_key_first($periods);
}

function finance_select(StateStore $store, array $periods, mixed $period): string
{
    if ($period === null) return finance_active($store, $periods);
    $period = api_text($period, 'period', 120, true);
    if (!array_key_exists($period, $periods)) throw new ApiException(404, 'not_found', 'Finance period not found.');
    return $period;
}

function finance_summary(StateStore $store, mixed $period = null): array
{
    $periods = finance_periods($store);
    $selected = finance_select($store, $periods, $period);
    $state = $periods[$selected];
    $income = array_sum(array_column($state['incomes'] ?? [], 'amount'));
    $expense = array_sum(array_column($state['expenses'] ?? [], 'amount'));
    $categories = $state['categories'] ?? [];
    $unlimited = array_values(array_filter($categories, fn($category)=>($category['unlimited'] ?? false) === true));
    $unlimitedIds = array_column($unlimited, 'id');
    $budget = array_sum(array_column(array_filter($categories, fn($category)=>($category['unlimited'] ?? false) !== true), 'target'));
    $unlimitedExpense = array_sum(array_column(array_filter($state['expenses'] ?? [], fn($item)=>in_array($item['categoryId'] ?? '', $unlimitedIds, true)), 'amount'));
    $budgetedExpense = $expense - $unlimitedExpense;
    return ['active_period' => $selected, 'income_total' => $income, 'expense_total' => $expense, 'balance' => $income - $expense, 'budget_total' => $budget, 'budget_remaining' => $budget - $budgetedExpense, 'budgeted_expense_total' => $budgetedExpense, 'unlimited_expense_total' => $unlimitedExpense, 'unlimited_category_count' => count($unlimited), 'categories' => $categories];
}

function finance_api(StateStore $store, string $method, string $resource, array $body, array $query): array
{
    api_method($resource === '' ? ['GET'] : ['GET', 'POST'], $method);
    if ($method === 'GET') {
        if ($resource === '') return finance_summary($store, $query['period'] ?? null);
        $periods = finance_periods($store);
        $period = finance_select($store, $periods, $query['period'] ?? null);
        return $periods[$period][$resource] ?? [];
    }
    api_fields($body, $resource === 'expenses' ? ['period', 'category_id', 'description', 'amount', 'date'] : ['period', 'name', 'amount']);
    $amount = api_number($body['amount'] ?? null, 'amount');
    if ($amount <= 0) throw new ApiException(422, 'validation_error', 'amount must be positive.');
    $category = $description = $date = $name = null;
    if ($resource === 'expenses') {
        $category = api_text($body['category_id'] ?? '', 'category_id', 128, true);
        $description = api_text($body['description'] ?? '', 'description', 2000);
        $date = api_date($body['date'] ?? api_today(), 'date');
        if ($date === null) throw new ApiException(422, 'validation_error', 'Expense date is required.');
    } else $name = api_text($body['name'] ?? '', 'name', 200, true);
    return $store->mutate([FINANCE_KEY => [], FINANCE_LEGACY_KEY => finance_default()], function (array &$docs) use ($store, $resource, $body, $amount, $category, $description, $date, $name) {
        if (!$docs[FINANCE_KEY]) $docs[FINANCE_KEY] = ['Current' => $docs[FINANCE_LEGACY_KEY]];
        $period = finance_select($store, $docs[FINANCE_KEY], $body['period'] ?? null);
        $state =& $docs[FINANCE_KEY][$period];
        if ($resource === 'expenses') {
            if (!in_array($category, array_map('strval', array_column($state['categories'] ?? [], 'id')), true)) throw new ApiException(422, 'validation_error', 'category_id does not exist in this period.');
            // Browser stores an English month/day label, not an ISO date.
            $entry = ['id' => api_uuid(), 'categoryId' => $category, 'desc' => $description, 'amount' => $amount, 'date' => (new DateTimeImmutable($date))->format('M j')];
            $state['expenses'][] = $entry;
        } else {
            $incomeId = preg_replace('/\s+/u', '_', mb_strtolower($name, 'UTF-8'));
            $entry = ['id' => $incomeId, 'name' => $name, 'amount' => $amount];
            $updated = false;
            foreach ($state['incomes'] as &$income) if ((string) $income['id'] === $incomeId) { $income['amount'] = $amount; $entry = $income; $updated = true; break; }
            if (!$updated) $state['incomes'][] = $entry;
        }
        if ($period === finance_active($store, $docs[FINANCE_KEY])) $docs[FINANCE_LEGACY_KEY] = $state;
        return $entry;
    });
}
