<?php

declare(strict_types=1);

require_once __DIR__ . '/finance.php';

const OBLIGATIONS_KEY = 'edi_obligations_v1';
function obligations_default(): array { return ['version' => 1, 'plans' => [], 'decisions' => []]; }

// Debts are paid out as expenses; credits (money owed to you) arrive as income.
// Plans created before directions existed are debts.
function obligation_direction(array $plan): string { return ($plan['direction'] ?? 'debt') === 'credit' ? 'credit' : 'debt'; }
function obligation_ledger(array $plan): string { return obligation_direction($plan) === 'credit' ? 'incomes' : 'expenses'; }
function obligation_entry_id(array $decision): string { return (string) ($decision['incomeId'] ?? $decision['expenseId'] ?? ''); }
// The store keeps an emptied JSON object as {} (stdClass); decisions are always read as an array.
function obligation_doc(array $doc): array { if (($doc['decisions'] ?? null) instanceof stdClass) $doc['decisions'] = (array) $doc['decisions']; return $doc; }
function obligation_totals(): array { return ['scheduled' => 0, 'committed' => 0, 'paid' => 0, 'remaining' => 0, 'skipped' => 0, 'overdue' => 0, 'carryOver' => 0]; }

function obligation_audit(array &$doc, string $action, string $id, array $before, array $after): void
{
    $doc['history'][] = ['id' => api_uuid(), 'action' => $action, 'occurrenceId' => $id, 'at' => api_now(), 'from' => $before['status'] ?? 'pending', 'to' => $after['status'] ?? 'pending', 'period' => $after['period'] ?? $before['period'] ?? null, 'expenseId' => $after['expenseId'] ?? $before['expenseId'] ?? null, 'incomeId' => $after['incomeId'] ?? $before['incomeId'] ?? null, 'note' => $after['note'] ?? ''];
}

function obligation_integer(mixed $value, string $field, int $min, int $max): int
{
    $number = api_number($value, $field, $min);
    if (floor((float) $number) !== (float) $number || $number > $max) throw new ApiException(422, 'validation_error', "$field must be an integer between $min and $max.");
    return (int) $number;
}

function obligation_due(array $plan, int $index): string
{
    $start = new DateTimeImmutable($plan['startDate'], new DateTimeZone('Asia/Tehran'));
    $step = $index * $plan['interval'];
    if (in_array($plan['frequency'], ['weekly', 'daily'], true)) return $start->modify('+' . ($step * ($plan['frequency'] === 'weekly' ? 7 : 1)) . ' days')->format('Y-m-d');
    // Always anchor to the original day: Jan 31 -> Feb 28 -> Mar 31.
    $month = $start->modify('first day of this month')->modify('+' . ($step * ($plan['frequency'] === 'yearly' ? 12 : 1)) . ' months');
    return $month->setDate((int) $month->format('Y'), (int) $month->format('m'), min((int) $start->format('d'), (int) $month->format('t')))->format('Y-m-d');
}

function obligation_amount(array $plan, int $index): int
{
    if ($plan['type'] === 'recurring') return obligation_recurring_amount($plan, obligation_due($plan, $index));
    $base = intdiv($plan['totalAmount'], $plan['count']);
    return $base + ($index === $plan['count'] - 1 ? $plan['totalAmount'] % $plan['count'] : 0);
}

function obligation_recurring_amount(array $plan, string $date): int
{
    $amount = (int) $plan['amount'];
    foreach ($plan['amountChanges'] ?? [] as $change) {
        if ($change['from'] <= $date) $amount = (int) $change['amount'];
    }
    return $amount;
}

function obligation_record(array $plan, int $index, array $decisions, array $periods): array
{
    $id = $plan['id'] . ':' . $index;
    $decision = $decisions[$id] ?? [];
    $amount = obligation_amount($plan, $index);
    $status = $decision['status'] ?? 'pending';
    // A recorded receipt/payment keeps its original amount after future edits.
    if ($status === 'paid') $amount = (int) ($decision['expenseSnapshot']['amount'] ?? $decision['recordedAmount'] ?? $amount);
    $paymentIssue = false;
    if ($status === 'paid') {
        $linked = null;
        foreach ($periods[$decision['period'] ?? ''][obligation_ledger($plan)] ?? [] as $entry) if ((string) $entry['id'] === obligation_entry_id($decision)) { $linked = $entry; break; }
        $paymentIssue = !$linked || (float) $linked['amount'] !== (float) $amount;
        if ($paymentIssue) $status = 'pending';
    }
    $skipped = $status === 'rejected' && $plan['optional'];
    $due = obligation_due($plan, $index);
    return ['id' => $id, 'planId' => $plan['id'], 'index' => $index, 'count' => $plan['count'], 'title' => $plan['title'], 'type' => $plan['type'], 'direction' => obligation_direction($plan), 'frequency' => $plan['frequency'], 'interval' => $plan['interval'], 'optional' => $plan['optional'], 'payee' => $plan['payee'], 'amount' => $amount, 'date' => $due, 'status' => $status, 'skipped' => $skipped, 'overdue' => !$skipped && $status !== 'paid' && $due < api_today(), 'paymentIssue' => $paymentIssue, 'decision' => $decision];
}

function obligation_view(array $doc, array $periods, string $start, string $end): array
{
    $doc = obligation_doc($doc);
    $occurrences = [];
    $byDirection = ['debt' => obligation_totals(), 'credit' => obligation_totals()];
    foreach ($doc['plans'] as $plan) {
        $totals =& $byDirection[obligation_direction($plan)];
        for ($index = 0; $index < ($plan['count'] ?? 20000); $index++) {
            $due = obligation_due($plan, $index);
            if ($due > $end) break;
            $decision = $doc['decisions'][$plan['id'] . ':' . $index] ?? null;
            if (($plan['endDate'] && $due > $plan['endDate']) || (($plan['cancelFrom'] ?? null) && $due >= $plan['cancelFrom'] && !$decision)) continue;
            $item = obligation_record($plan, $index, $doc['decisions'], $periods);
            $unpaid = $item['status'] !== 'paid' && !$item['skipped'];
            if ($due < $start) {
                if ($unpaid) { $totals['carryOver'] += $item['amount']; $occurrences[] = $item; }
                continue;
            }
            $occurrences[] = $item;
            $totals['scheduled'] += $item['amount'];
            if ($item['skipped']) { $totals['skipped'] += $item['amount']; continue; }
            $totals['committed'] += $item['amount'];
            if ($item['status'] === 'paid') $totals['paid'] += $item['amount'];
            else { $totals['remaining'] += $item['amount']; if ($item['overdue']) $totals['overdue'] += $item['amount']; }
        }
        unset($totals);
    }
    usort($occurrences, fn ($a, $b) => strcmp($a['date'] . $a['id'], $b['date'] . $b['id']));
    $plans = $doc['plans'];
    foreach ($plans as &$plan) if ($plan['type'] !== 'recurring') {
        $paid = 0; $paidCount = 0;
        for ($index = 0; $index < $plan['count']; $index++) {
            if (($doc['decisions'][$plan['id'] . ':' . $index]['status'] ?? '') !== 'paid') continue;
            $item = obligation_record($plan, $index, $doc['decisions'], $periods);
            if ($item['status'] === 'paid') { $paid += $item['amount']; $paidCount++; }
        }
        $plan['progress'] = ['paid' => $paid, 'remaining' => $plan['totalAmount'] - $paid, 'paidCount' => $paidCount];
    }
    unset($plan);
    foreach ($plans as &$plan) {
        $plan['direction'] = obligation_direction($plan);
        if ($plan['type'] === 'recurring') $plan['currentAmount'] = obligation_recurring_amount($plan, api_today());
    }
    unset($plan);
    // `totals` keeps its original meaning (debts) for existing clients.
    return ['plans' => $plans, 'occurrences' => $occurrences, 'totals' => $byDirection['debt'], 'creditTotals' => $byDirection['credit'], 'history' => array_slice($doc['history'] ?? [], -30), 'start' => $start, 'end' => $end];
}

function obligation_new_plan(array $body): array
{
    api_fields($body, ['title', 'payee', 'type', 'direction', 'optional', 'amount', 'totalAmount', 'count', 'startDate', 'endDate', 'frequency', 'interval', 'notes']);
    $direction = api_enum($body['direction'] ?? 'debt', 'direction', ['debt', 'credit']);
    $type = api_enum($body['type'] ?? null, 'type', ['once', 'recurring', 'installment', 'debt']);
    if ($type === 'once') {
        // A single due: one finite payment of the full amount.
        $body['count'] = 1;
        $body['totalAmount'] = $body['totalAmount'] ?? $body['amount'] ?? null;
        $body['endDate'] = null;
    }
    $start = api_date($body['startDate'] ?? null, 'startDate');
    $end = api_date($body['endDate'] ?? null, 'endDate');
    if (!$start || $start < '2000-01-01' || $start > (new DateTimeImmutable(api_today()))->modify('+5 years')->format('Y-m-d') || ($end && $end < $start)) throw new ApiException(422, 'validation_error', 'Choose a valid start date (2000 or later, up to five years ahead) and an end date after it.');
    $count = ($body['count'] ?? null) === null ? null : obligation_integer($body['count'], 'count', 1, 600);
    if ($type !== 'recurring' && !$count) throw new ApiException(422, 'validation_error', 'Split payments need a finite payment count.');
    $optional = api_bool($body['optional'] ?? false, 'optional');
    if ($optional && ($type !== 'recurring' || $direction !== 'debt')) throw new ApiException(422, 'validation_error', 'Only recurring payments you owe can be optional.');
    $amount = $type === 'recurring' ? obligation_integer($body['amount'] ?? null, 'amount', 1, 1000000000000) : 0;
    $total = $type !== 'recurring' ? obligation_integer($body['totalAmount'] ?? null, 'totalAmount', $count, 1000000000000) : null;
    $plan = ['id' => api_uuid(), 'title' => api_text($body['title'] ?? '', 'title', 180, true), 'payee' => api_text($body['payee'] ?? '', 'payee', 180), 'type' => $type, 'direction' => $direction, 'optional' => $optional, 'amount' => $amount, 'totalAmount' => $total, 'count' => $count, 'startDate' => $start, 'endDate' => $end, 'frequency' => api_enum($body['frequency'] ?? 'monthly', 'frequency', ['daily', 'weekly', 'monthly', 'yearly']), 'interval' => obligation_integer($body['interval'] ?? 1, 'interval', 1, 12), 'notes' => api_text($body['notes'] ?? '', 'notes', 3000), 'createdAt' => api_now(), 'cancelFrom' => null];
    if ($type !== 'recurring' && $end && $end < obligation_due($plan, $count - 1)) throw new ApiException(422, 'validation_error', 'An end date cannot remove scheduled payments.');
    return $plan;
}

function obligation_find(array $doc, mixed $id, array $periods): array
{
    $doc = obligation_doc($doc);
    if (!is_string($id) || !preg_match('/^([a-f0-9-]{36}):([0-9]{1,5})$/D', $id, $match)) throw new ApiException(422, 'validation_error', 'Invalid occurrence.');
    foreach ($doc['plans'] as $plan) if ($plan['id'] === $match[1]) {
        $index = (int) $match[2];
        $due = obligation_due($plan, $index);
        if ($index >= 20000 || ($plan['count'] !== null && $index >= $plan['count']) || ($plan['endDate'] && $due > $plan['endDate']) || (($plan['cancelFrom'] ?? null) && $due >= $plan['cancelFrom'] && !isset($doc['decisions'][$id])) || $due > (new DateTimeImmutable(api_today()))->modify('+5 years')->format('Y-m-d')) break;
        return obligation_record($plan, $index, $doc['decisions'], $periods);
    }
    throw new ApiException(404, 'not_found', 'Payment occurrence not found.');
}

function obligation_mutate(StateStore $store, array $body): array
{
    api_fields($body, ['action', 'plan', 'planId', 'occurrenceId', 'cancelFrom', 'period', 'categoryId', 'expenseId', 'incomeId', 'paymentDate', 'note', 'revisions']);
    $action = api_enum($body['action'] ?? null, 'action', ['create', 'update', 'delete', 'cancel', 'pay', 'undo', 'reject', 'restore']);
    $financial = in_array($action, ['pay', 'undo'], true);
    $defaults = [OBLIGATIONS_KEY => obligations_default()];
    if ($financial) $defaults += [FINANCE_KEY => [], FINANCE_LEGACY_KEY => finance_default()];
    $result = $store->mutate($defaults, function (array &$docs) use ($store, $body, $action, $financial): array {
        $docs[OBLIGATIONS_KEY] = obligation_doc($docs[OBLIGATIONS_KEY]);
        $doc =& $docs[OBLIGATIONS_KEY];
        if ($doc['version'] !== 1 || !is_array($doc['plans']) || !is_array($doc['decisions'])) throw new ApiException(409, 'invalid_document', 'Unable to read obligations.');
        if ($action === 'create') {
            if (count($doc['plans']) >= 200) throw new ApiException(422, 'limit_reached', 'At most 200 payment plans are supported.');
            if (!is_array($body['plan'] ?? null)) throw new ApiException(422, 'validation_error', 'plan must be an object.');
            $plan = obligation_new_plan($body['plan']);
            $doc['plans'][] = $plan;
            return $plan;
        }
        if ($action === 'update') {
            // Amount revisions apply from a date; the original schedule remains stable.
            if (!is_array($body['plan'] ?? null)) throw new ApiException(422, 'validation_error', 'plan must be an object.');
            api_fields($body['plan'], ['title', 'payee', 'notes', 'amount', 'effectiveFrom', 'applyToUnpaid']);
            foreach ($doc['plans'] as &$plan) if ($plan['id'] === ($body['planId'] ?? null)) {
                if (array_key_exists('amount', $body['plan'])) {
                    if ($plan['type'] !== 'recurring') throw new ApiException(422, 'validation_error', 'Only recurring amounts can be changed.');
                    $amount = obligation_integer($body['plan']['amount'], 'amount', 1, 1000000000000);
                    $allUnpaid = api_bool($body['plan']['applyToUnpaid'] ?? false, 'applyToUnpaid');
                    $from = $allUnpaid ? $plan['startDate'] : api_date($body['plan']['effectiveFrom'] ?? null, 'effectiveFrom');
                    if (!$from || $from < $plan['startDate'] || $from > (new DateTimeImmutable(api_today()))->modify('+5 years')->format('Y-m-d')) throw new ApiException(422, 'validation_error', 'Choose an effective date on or after the first due date, up to five years ahead.');
                    // Freeze legacy paid amounts before revising any schedule amounts.
                    foreach ($doc['decisions'] as $id => &$decision) {
                        if (str_starts_with((string) $id, $plan['id'] . ':') && ($decision['status'] ?? '') === 'paid' && !isset($decision['expenseSnapshot']['amount'])) {
                            $decision['recordedAmount'] ??= obligation_amount($plan, (int) substr((string) $id, strlen($plan['id']) + 1));
                        }
                    }
                    unset($decision);
                    $changes = $allUnpaid ? [] : array_values(array_filter($plan['amountChanges'] ?? [], fn ($change) => $change['from'] !== $from));
                    $changes[] = ['from' => $from, 'amount' => $amount];
                    usort($changes, fn ($a, $b) => strcmp($a['from'], $b['from']));
                    if (count($changes) > 600) throw new ApiException(422, 'limit_reached', 'Too many amount changes.');
                    $plan['amountChanges'] = $changes;
                }
                $plan['title'] = api_text($body['plan']['title'] ?? $plan['title'], 'title', 180, true);
                $plan['payee'] = api_text($body['plan']['payee'] ?? $plan['payee'], 'payee', 180);
                $plan['notes'] = api_text($body['plan']['notes'] ?? $plan['notes'], 'notes', 3000);
                return $plan;
            }
            throw new ApiException(404, 'not_found', 'Plan not found.');
        }
        if ($action === 'delete') {
            // Deleting is for mistakes; anything already recorded in the ledger must be undone first.
            foreach ($doc['plans'] as $index => $plan) if ($plan['id'] === ($body['planId'] ?? null)) {
                $prefix = $plan['id'] . ':';
                foreach ($doc['decisions'] as $id => $decision) if (str_starts_with((string) $id, $prefix) && ($decision['status'] ?? '') === 'paid') throw new ApiException(409, 'has_payments', 'Undo recorded payments before deleting this plan.');
                foreach (array_keys($doc['decisions']) as $id) if (str_starts_with((string) $id, $prefix)) unset($doc['decisions'][$id]);
                array_splice($doc['plans'], $index, 1);
                obligation_audit($doc, 'delete', $prefix . '0', [], ['status' => 'deleted', 'note' => $plan['title']]);
                return ['deleted' => $plan['id']];
            }
            throw new ApiException(404, 'not_found', 'Plan not found.');
        }
        if ($action === 'cancel') {
            $date = api_date($body['cancelFrom'] ?? api_today(), 'cancelFrom');
            if (!$date || $date < api_today()) throw new ApiException(422, 'validation_error', 'Stop date must be today or later. Past dues cannot be removed.');
            foreach ($doc['plans'] as &$plan) if ($plan['id'] === ($body['planId'] ?? null)) {
                if ($plan['type'] !== 'recurring') throw new ApiException(422, 'validation_error', 'Fixed schedules cannot be stopped. Defer individual dues instead.');
                $plan['cancelFrom'] = $date;
                return $plan;
            }
            throw new ApiException(404, 'not_found', 'Plan not found.');
        }
        $periods = $financial ? ($docs[FINANCE_KEY] ?: ['Current' => $docs[FINANCE_LEGACY_KEY]]) : finance_periods($store);
        $item = obligation_find($doc, $body['occurrenceId'] ?? null, $periods);
        $id = $item['id'];
        $previous = $doc['decisions'][$id] ?? [];
        $credit = $item['direction'] === 'credit';
        $ledger = $credit ? 'incomes' : 'expenses';
        $entryKey = $credit ? 'incomeId' : 'expenseId';
        if (in_array($action, ['reject', 'restore'], true)) {
            if (($previous['status'] ?? '') === 'paid') throw new ApiException(409, 'already_paid', 'Undo the payment before changing its status.');
            $doc['decisions'][$id] = ['status' => $action === 'reject' ? 'rejected' : 'pending', 'note' => api_text($body['note'] ?? '', 'note', 1000), 'updatedAt' => api_now()];
            obligation_audit($doc, $action, $id, $previous, $doc['decisions'][$id]);
            return $doc['decisions'][$id];
        }
        if ($action === 'undo') {
            if (($previous['status'] ?? '') !== 'paid') throw new ApiException(409, 'not_paid', 'This payment is not marked paid.');
            if (($previous['createdExpense'] ?? false) && isset($periods[$previous['period']][$ledger])) {
                $entries =& $periods[$previous['period']][$ledger];
                foreach ($entries ?? [] as $index => $entry) if ((string) $entry['id'] === obligation_entry_id($previous)) {
                    // Preserve manual changes/imported replacements. Only an
                    // unchanged expense owned by this payment is removed.
                    if ($entry == $previous['expenseSnapshot']) array_splice($entries, $index, 1);
                    break;
                }
            }
            $doc['decisions'][$id] = ['status' => 'pending', 'updatedAt' => api_now()];
        } else {
            if (($previous['status'] ?? '') === 'paid') throw new ApiException(409, 'already_paid', 'Payment already recorded. Undo it before recording again.');
            $period = api_text($body['period'] ?? '', 'period', 120, true);
            if (!isset($periods[$period])) throw new ApiException(422, 'validation_error', 'Choose an existing finance period.');
            $date = api_date($body['paymentDate'] ?? api_today(), 'paymentDate');
            if (!$date || $date > api_today()) throw new ApiException(422, 'validation_error', 'Payment date must be today or earlier.');
            $linkId = api_text($body[$entryKey] ?? '', $entryKey, 128);
            $created = $linkId === '';
            $entry = null;
            if (!$created) {
                foreach ($doc['decisions'] as $other) if (($other['status'] ?? '') === 'paid' && ($other['period'] ?? '') === $period && ($other[$entryKey] ?? '') === $linkId) throw new ApiException(409, 'entry_linked', $credit ? 'This income is already linked to a payment.' : 'This expense is already linked to a payment.');
                foreach ($periods[$period][$ledger] ?? [] as $candidate) if ((string) $candidate['id'] === $linkId) $entry = $candidate;
                if (!$entry || (float) $entry['amount'] !== (float) $item['amount']) throw new ApiException(422, 'validation_error', $credit ? 'Choose an income with the exact amount.' : 'Choose an expense with the exact payment amount.');
            } elseif ($credit) {
                $entry = ['id' => api_uuid(), 'name' => $item['title'] . ' · due ' . $item['date'], 'amount' => $item['amount'], 'dateISO' => $date, 'obligationId' => $id];
                $periods[$period]['incomes'][] = $entry;
            } else {
                $category = api_text($body['categoryId'] ?? '', 'categoryId', 128, true);
                if (!in_array($category, array_map('strval', array_column($periods[$period]['categories'] ?? [], 'id')), true)) throw new ApiException(422, 'validation_error', 'Choose a category in the selected period.');
                $entry = ['id' => api_uuid(), 'categoryId' => $category, 'desc' => $item['title'] . ' · due ' . $item['date'], 'amount' => $item['amount'], 'date' => (new DateTimeImmutable($date))->format('M j'), 'dateISO' => $date, 'obligationId' => $id];
                $periods[$period]['expenses'][] = $entry;
            }
            $doc['decisions'][$id] = ['status' => 'paid', 'period' => $period, $entryKey => (string) $entry['id'], 'createdExpense' => $created, 'expenseSnapshot' => $entry, 'paymentDate' => $date, 'note' => api_text($body['note'] ?? '', 'note', 1000), 'updatedAt' => api_now()];
        }
        obligation_audit($doc, $action, $id, $previous, $doc['decisions'][$id]);
        $docs[FINANCE_KEY] = $periods;
        $active = finance_active($store, $periods);
        $docs[FINANCE_LEGACY_KEY] = $periods[$active];
        return $doc['decisions'][$id];
    }, is_array($body['revisions'] ?? null) ? $body['revisions'] : []);
    $updates = [];
    foreach (array_keys($defaults) as $key) {
        $raw = $store->raw($key);
        if ($raw !== null) $updates[$key] = ['value' => $raw, 'revision' => hash('sha256', $raw)];
    }
    return ['result' => $result, 'updates' => $updates];
}
