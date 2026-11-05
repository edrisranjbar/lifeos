<?php

declare(strict_types=1);

const KANBAN_KEY = 'kanban_boards_v1';
const TASK_CUSTOM_FIELDS_MAX = 50;
const TASK_CUSTOM_FIELD_NAME_MAX = 60;
const TASK_CUSTOM_FIELD_VALUE_MAX = 500;

function tasks_done_column(array $column): bool
{
    return in_array(mb_strtolower(trim((string) ($column['name'] ?? ''))), ['done', 'completed', 'complete'], true);
}

function tasks_aggregate(array $goals, array $boards): array
{
    $tasks = [];
    foreach ($goals['goals'] ?? [] as $goal) foreach ($goal['tasks'] ?? [] as $task) {
        $tasks[] = ['id' => (string) $task['id'], 'source' => 'goal', 'goal_id' => (string) $goal['id'], 'title' => $task['title'], 'done' => ($task['done'] ?? false) === true, 'due_date' => $task['dueDate'] ?? $goal['deadline'] ?? null, 'priority' => $task['priority'] ?? $goal['priority'] ?? 'medium', 'custom_fields' => []];
    }
    foreach ($boards['boards'] ?? [] as $board) foreach ($board['columns'] ?? [] as $column) foreach ($column['cards'] ?? [] as $card) {
        $tasks[] = ['id' => (string) $card['id'], 'source' => 'kanban', 'board_id' => (string) $board['id'], 'column_id' => (string) $column['id'], 'title' => $card['title'], 'done' => tasks_done_column($column), 'due_date' => ($card['dueDate'] ?? '') ?: null, 'priority' => $card['priority'] ?? 'medium', 'description' => $card['description'] ?? '', 'custom_fields' => is_array($card['customFields'] ?? null) ? array_values($card['customFields']) : []];
    }
    return $tasks;
}

function tasks_search_text(array $task): string
{
    $parts = [$task['title'] ?? '', $task['description'] ?? ''];
    foreach ($task['custom_fields'] ?? [] as $field) $parts[] = ($field['name'] ?? '') . ' ' . ($field['value'] ?? '');
    return mb_strtolower(implode(' ', $parts));
}

function tasks_matches(array $task, array $query): bool
{
    foreach (['source', 'goal_id', 'board_id', 'column_id'] as $field) if (isset($query[$field]) && (string) ($task[$field] ?? '') !== $query[$field]) return false;
    $search = is_string($query['q'] ?? null) ? trim($query['q']) : '';
    return $search === '' || str_contains(tasks_search_text($task), mb_strtolower($search));
}

function tasks_card_field(string $field): string
{
    return match ($field) {
        'due_date' => 'dueDate',
        'custom_fields' => 'customFields',
        default => $field,
    };
}

function tasks_custom_fields(mixed $value): array
{
    $result = [];
    $seen = [];
    foreach (api_list($value, 'custom_fields', TASK_CUSTOM_FIELDS_MAX) as $index => $item) {
        if (!is_array($item)) throw new ApiException(422, 'validation_error', "custom_fields[$index] must be an object.");
        api_fields($item, ['id', 'name', 'value']);
        $id = isset($item['id']) ? api_text($item['id'], "custom_fields[$index].id", 128, true) : api_uuid();
        if (isset($seen[$id])) throw new ApiException(422, 'validation_error', "custom_fields[$index].id must be unique.");
        $seen[$id] = true;
        $result[] = [
            'id' => $id,
            'name' => api_text($item['name'] ?? '', "custom_fields[$index].name", TASK_CUSTOM_FIELD_NAME_MAX, true),
            'value' => api_text($item['value'] ?? '', "custom_fields[$index].value", TASK_CUSTOM_FIELD_VALUE_MAX),
        ];
    }
    return $result;
}

function tasks_validate(array $body, bool $create): array
{
    api_fields($body, $create ? ['source', 'goal_id', 'board_id', 'column_id', 'title', 'description', 'priority', 'due_date', 'done', 'custom_fields'] : ['column_id', 'title', 'description', 'priority', 'due_date', 'done', 'custom_fields']);
    if ($create) api_enum($body['source'] ?? null, 'source', ['goal', 'kanban']);
    if ($create && $body['source'] === 'goal') api_text($body['goal_id'] ?? '', 'goal_id', 128, true);
    if ($create && $body['source'] === 'kanban') {
        api_text($body['board_id'] ?? '', 'board_id', 128, true);
        api_text($body['column_id'] ?? '', 'column_id', 128, true);
    }
    foreach ($body as $field => &$value) {
        if (in_array($field, ['title', 'description', 'goal_id', 'board_id', 'column_id'], true)) $value = api_text($value, $field, $field === 'description' ? 20000 : ($field === 'title' ? 500 : 128), $field !== 'description');
        elseif ($field === 'priority') $value = api_enum($value, $field, ['low', 'medium', 'high']);
        elseif ($field === 'due_date') $value = api_date($value, $field);
        elseif ($field === 'done') $value = api_bool($value, $field);
        elseif ($field === 'custom_fields') $value = tasks_custom_fields($value);
    }
    if ($create) api_text($body['title'] ?? '', 'title', 500, true);
    return $body;
}

function tasks_api(StateStore $store, string $method, ?string $id, bool $complete, array $body, array $query): array
{
    api_method($complete ? ['POST'] : ($id === null ? ['GET', 'POST'] : ['GET', 'PATCH', 'DELETE']), $method);
    $defaults = [GOALS_KEY => ['goals' => []], KANBAN_KEY => ['boards' => [], 'activeBoardId' => null]];
    if ($method === 'GET') {
        $tasks = array_values(array_filter(tasks_aggregate($store->get(GOALS_KEY, $defaults[GOALS_KEY]), $store->get(KANBAN_KEY, $defaults[KANBAN_KEY])), fn ($task) => ($id === null || $task['id'] === $id) && tasks_matches($task, $query)));
        if ($id === null) return $tasks;
        if (count($tasks) > 1) throw new ApiException(409, 'ambiguous_task', 'Specify source and goal_id or board_id to identify this task.');
        return $tasks[0] ?? throw new ApiException(404, 'not_found', 'Task not found.');
    }
    $body = $complete ? ['done' => true] : ($method === 'DELETE' ? [] : tasks_validate($body, $id === null));
    return $store->mutate($defaults, function (array &$docs) use ($id, $method, $body, $query) {
        if ($id === null) {
            $source = $body['source'];
            $new = ['id' => api_uuid(), 'title' => $body['title']];
            if ($source === 'goal') {
                if (isset($body['column_id']) || isset($body['description']) || isset($body['board_id']) || isset($body['custom_fields'])) throw new ApiException(422, 'validation_error', 'Goal tasks do not support description, board/column, or custom fields.');
                foreach ($docs[GOALS_KEY]['goals'] as &$goal) if ((string) $goal['id'] === ($body['goal_id'] ?? '')) {
                    $new['done'] = $body['done'] ?? false;
                    if (array_key_exists('due_date', $body)) $new['dueDate'] = $body['due_date'];
                    if (isset($body['priority'])) $new['priority'] = $body['priority'];
                    $goal['tasks'][] = $new; $goal['updatedAt'] = api_now();
                    return ['id' => $new['id'], 'source' => 'goal', 'goal_id' => $goal['id'], 'title' => $new['title'], 'done' => $new['done'], 'due_date' => $new['dueDate'] ?? $goal['deadline'] ?? null, 'priority' => $new['priority'] ?? $goal['priority'] ?? 'medium'];
                }
                throw new ApiException(404, 'not_found', 'Goal not found.');
            }
            if (isset($body['goal_id'])) throw new ApiException(422, 'validation_error', 'Kanban tasks do not support goal_id.');
            foreach ($docs[KANBAN_KEY]['boards'] as &$board) if ((string) $board['id'] === ($body['board_id'] ?? '')) {
                foreach ($board['columns'] as &$column) if ((string) $column['id'] === ($body['column_id'] ?? '')) {
                    if (isset($body['done']) && $body['done'] !== tasks_done_column($column)) throw new ApiException(409, 'completion_conflict', 'Select a column matching the requested completion state.');
                    $new += ['description' => $body['description'] ?? '', 'priority' => $body['priority'] ?? 'medium', 'dueDate' => $body['due_date'] ?? '', 'labelIds' => [], 'customFields' => $body['custom_fields'] ?? [], 'checklist' => [], 'completed' => tasks_done_column($column), 'createdAt' => api_now()];
                    $column['cards'][] = $new;
                    return ['id' => $new['id'], 'source' => 'kanban', 'board_id' => $board['id'], 'column_id' => $column['id'], 'title' => $new['title'], 'done' => tasks_done_column($column), 'due_date' => $new['dueDate'] ?: null, 'description' => $new['description'], 'priority' => $new['priority'], 'custom_fields' => $new['customFields']];
                }
                throw new ApiException(404, 'not_found', 'Column not found.');
            }
            throw new ApiException(404, 'not_found', 'Board not found.');
        }
        $matches = array_values(array_filter(tasks_aggregate($docs[GOALS_KEY], $docs[KANBAN_KEY]), fn ($task) => $task['id'] === $id && tasks_matches($task, $query)));
        if (!$matches) throw new ApiException(404, 'not_found', 'Task not found.');
        if (count($matches) > 1) throw new ApiException(409, 'ambiguous_task', 'Specify source and goal_id or board_id to identify this task.');
        $found = $matches[0];
        if ($found['source'] === 'goal') {
            if (isset($body['description']) || isset($body['column_id']) || isset($body['custom_fields'])) throw new ApiException(422, 'validation_error', 'Goal tasks do not support description, column_id, or custom fields.');
            foreach ($docs[GOALS_KEY]['goals'] as &$goal) if ((string) $goal['id'] === $found['goal_id']) {
                foreach ($goal['tasks'] as $index => &$task) if ((string) $task['id'] === $id) {
                    $goal['updatedAt'] = api_now();
                    if ($method === 'DELETE') { array_splice($goal['tasks'], $index, 1); return ['deleted' => true]; }
                    foreach ($body as $field => $value) $task[$field === 'due_date' ? 'dueDate' : $field] = $value;
                    break;
                }
                break;
            }
        } else {
            foreach ($docs[KANBAN_KEY]['boards'] as &$board) if ((string) $board['id'] === $found['board_id']) {
                $from = null; $cardIndex = null;
                foreach ($board['columns'] as $ci => $col) foreach ($col['cards'] as $ti => $card) if ((string) $card['id'] === $id) { $from = $ci; $cardIndex = $ti; }
                if ($method === 'DELETE') { array_splice($board['columns'][$from]['cards'], $cardIndex, 1); return ['deleted' => true]; }
                $to = $from;
                if (isset($body['column_id'])) {
                    $to = null;
                    foreach ($board['columns'] as $ci => $col) if ((string) $col['id'] === $body['column_id']) $to = $ci;
                    if ($to === null) throw new ApiException(404, 'not_found', 'Destination column not found.');
                }
                if (isset($body['done'])) {
                    if ($body['done'] && !tasks_done_column($board['columns'][$to])) {
                        if (isset($body['column_id'])) throw new ApiException(409, 'completion_conflict', 'Destination must be a Done column.');
                        $to = null;
                        foreach ($board['columns'] as $ci => $col) if (tasks_done_column($col)) { $to = $ci; break; }
                        if ($to === null) throw new ApiException(409, 'no_done_column', 'Board has no Done, Completed or Complete column.');
                    } elseif (!$body['done'] && tasks_done_column($board['columns'][$to])) throw new ApiException(409, 'completion_conflict', 'Provide a non-complete column_id to reopen this card.');
                }
                $card = $board['columns'][$from]['cards'][$cardIndex];
                foreach ($body as $field => $value) if (!in_array($field, ['column_id', 'done'], true)) $card[tasks_card_field($field)] = $value ?? '';
                if ($to !== $from || isset($body['done'])) $card['completed'] = tasks_done_column($board['columns'][$to]);
                $card['updatedAt'] = api_now();
                if ($to !== $from) { array_splice($board['columns'][$from]['cards'], $cardIndex, 1); $board['columns'][$to]['cards'][] = $card; }
                else $board['columns'][$from]['cards'][$cardIndex] = $card;
                break;
            }
        }
        foreach (tasks_aggregate($docs[GOALS_KEY], $docs[KANBAN_KEY]) as $task) if ($task['id'] === $id && $task['source'] === $found['source'] && (($task['goal_id'] ?? $task['board_id']) === ($found['goal_id'] ?? $found['board_id']))) return $task;
        throw new RuntimeException('Updated task not found.');
    });
}
