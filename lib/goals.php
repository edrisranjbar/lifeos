<?php

declare(strict_types=1);

require_once __DIR__ . '/user_context.php';

const GOALS_KEY = 'edi_goals_v1';

function goals_measures(array $goal): array
{
    return $goal['measures'] ?? (isset($goal['target']) ? [['target'=>$goal['target'], 'current'=>$goal['current'] ?? null]] : []);
}

function goals_progress_source(array $goal): string
{
    if (!empty($goal['progressSource'])) return $goal['progressSource'];
    return empty($goal['tasks']) && count(array_filter(goals_measures($goal), fn($m)=>($m['target'] ?? 0)>0)) > 0 ? 'measure' : 'checklist';
}

function goals_progress(array $goal, ?PDO $db = null): ?array
{
    $source = goals_progress_source($goal);
    if ($source === 'habit') {
        if (!$db || empty($goal['startDate']) || empty($goal['deadline']) || empty($goal['habitProgress']['targetDays'])) return null;
        $query = $db->prepare('SELECT COUNT(DISTINCT log_date) FROM habit_logs WHERE user_id = ' . life_os_user_id() . ' AND habit_id = ? AND done = 1 AND log_date >= ? AND log_date <= ?');
        $query->execute([$goal['habitProgress']['habitId'], $goal['startDate'], min($goal['deadline'], api_today())]);
        $done = (int) $query->fetchColumn(); $total = (int) $goal['habitProgress']['targetDays'];
        return ['source' => $source, 'completedDays' => $done, 'targetDays' => $total, 'percent' => $done >= $total ? 100 : min(99, (int) round($done / $total * 100))];
    }
    if ($source === 'measure') {
        $measures = array_values(array_filter(goals_measures($goal), fn ($m) => ($m['target'] ?? 0) > 0));
        $sum = array_sum(array_map(fn ($m) => max(0, min(100, ($m['current'] ?? 0) / $m['target'] * 100)), $measures));
        return ['source' => $source, 'percent' => count($measures) ? (int) round($sum / count($measures)) : 0];
    }
    $tasks = $goal['tasks'] ?? []; $done = count(array_filter($tasks, fn ($t) => !empty($t['done'])));
    return ['source' => $source, 'percent' => count($tasks) ? ($done === count($tasks) ? 100 : min(99, (int) round($done / count($tasks) * 100))) : 0];
}

function goals_status(array $goal, ?PDO $db = null): string
{
    if (($goal['status'] ?? '') === 'archived') return 'archived';
    if (isset($goal['progressSource']) || goals_progress_source($goal) !== 'checklist') return (goals_progress($goal, $db)['percent'] ?? 0) === 100 ? 'completed' : 'active';
    $tasks = $goal['tasks'] ?? [];
    return count($tasks) > 0 && count(array_filter($tasks, fn ($task) => ($task['done'] ?? false) === true)) === count($tasks) ? 'completed' : 'active';
}

function goals_validate(array $body, array $existing = [], bool $create = false): array
{
    api_fields($body, ['title', 'specific', 'category', 'relevant', 'priority', 'deadline', 'startDate', 'notes', 'status', 'measures', 'tasks', 'progressSource', 'habitProgress']);
    $goal = $create ? ['id' => api_uuid(), 'title' => '', 'specific' => '', 'category' => '', 'relevant' => '', 'priority' => 'medium', 'deadline' => null, 'startDate' => null, 'notes' => '', 'status' => 'active', 'measures' => [], 'tasks' => [], 'metric' => '', 'target' => null, 'unit' => '', 'createdAt' => api_now()] : $existing;
    foreach ($body as $field => $value) {
        if (in_array($field, ['title', 'specific', 'category', 'relevant', 'notes'], true)) $goal[$field] = api_text($value, $field, in_array($field, ['specific', 'relevant', 'notes'], true) ? 20000 : 200, $field === 'title');
        elseif ($field === 'progressSource') $goal[$field] = api_enum($value, $field, ['checklist', 'measure', 'habit']);
        elseif ($field === 'habitProgress') {
            if ($value === null) { $goal[$field] = null; continue; }
            if (!is_array($value)) throw new ApiException(422, 'validation_error', 'habitProgress must be an object.');
            api_fields($value, ['habitId', 'habitName', 'targetDays']);
            $id = (string) ($value['habitId'] ?? ''); $target = $value['targetDays'] ?? 0;
            if (!ctype_digit($id) || (int) $id < 1 || !is_numeric($target) || (float) $target !== floor((float) $target) || $target < 1) throw new ApiException(422, 'validation_error', 'Use a valid habit id and positive whole-day target.');
            $goal[$field] = ['habitId' => $id, 'habitName' => api_text($value['habitName'] ?? '', 'habitName', 200), 'targetDays' => (int) $target];
        }
        elseif ($field === 'priority') $goal[$field] = api_enum($value, $field, ['low', 'medium', 'high']);
        elseif ($field === 'status') $goal[$field] = api_enum($value, $field, ['active', 'archived']);
        elseif (in_array($field, ['deadline', 'startDate'], true)) $goal[$field] = api_date($value, $field);
        elseif ($field === 'measures') {
            $goal[$field] = [];
            foreach (api_list($value, $field, 100) as $measure) {
                if (!is_array($measure)) throw new ApiException(422, 'validation_error', 'Each measure must be an object.');
                api_fields($measure, ['id', 'metric', 'target', 'unit', 'current']);
                $id = isset($measure['id']) ? api_text($measure['id'], 'measure.id', 128, true) : api_uuid();
                $old = array_values(array_filter($existing['measures'] ?? [], fn ($item) => ($item['id'] ?? '') === $id))[0] ?? [];
                $entry = array_merge(['id' => $id, 'unit' => '', 'target' => null, 'current' => null], $old);
                $entry['metric'] = api_text($measure['metric'] ?? $old['metric'] ?? '', 'measure.metric', 120, true);
                if (isset($measure['unit'])) $entry['unit'] = api_text($measure['unit'], 'measure.unit', 20);
                foreach (['target', 'current'] as $numeric) if (array_key_exists($numeric, $measure)) $entry[$numeric] = $measure[$numeric] === null ? null : api_number($measure[$numeric], "measure.$numeric");
                $goal[$field][] = $entry;
            }
            $goal['metric'] = $goal['measures'][0]['metric'] ?? '';
            $goal['target'] = $goal['measures'][0]['target'] ?? null;
            $goal['unit'] = $goal['measures'][0]['unit'] ?? '';
        } elseif ($field === 'tasks') {
            $goal[$field] = [];
            foreach (api_list($value, $field) as $task) {
                if (!is_array($task)) throw new ApiException(422, 'validation_error', 'Each task must be an object.');
                api_fields($task, ['id', 'title', 'done', 'due_date', 'priority']);
                $id = isset($task['id']) ? api_text($task['id'], 'task.id', 128, true) : api_uuid();
                $old = array_values(array_filter($existing['tasks'] ?? [], fn ($item) => ($item['id'] ?? '') === $id))[0] ?? [];
                $entry = array_merge(['id' => $id, 'done' => false], $old);
                $entry['title'] = api_text($task['title'] ?? $old['title'] ?? '', 'task.title', 500, true);
                if (array_key_exists('done', $task)) $entry['done'] = api_bool($task['done'], 'task.done');
                if (array_key_exists('due_date', $task)) $entry['dueDate'] = api_date($task['due_date'], 'task.due_date');
                if (isset($task['priority'])) $entry['priority'] = api_enum($task['priority'], 'task.priority', ['low', 'medium', 'high']);
                $goal[$field][] = $entry;
            }
        }
    }
    api_text($goal['title'] ?? '', 'title', 200, true);
    foreach (['tasks', 'measures'] as $field) {
        $ids = array_column($goal[$field] ?? [], 'id');
        if (count($ids) !== count(array_unique($ids))) throw new ApiException(422, 'validation_error', "Duplicate $field ids.");
    }
    if (!empty($goal['deadline']) && !empty($goal['startDate']) && $goal['startDate'] > $goal['deadline']) throw new ApiException(422, 'validation_error', 'startDate must not follow deadline.');
    if (($goal['progressSource'] ?? '') === 'habit') {
        if (empty($goal['habitProgress']) || empty($goal['startDate']) || empty($goal['deadline'])) throw new ApiException(422, 'validation_error', 'Habit goals require a linked habit, start date and deadline.');
        $days = (new DateTimeImmutable($goal['startDate']))->diff(new DateTimeImmutable($goal['deadline']))->days + 1;
        if ($goal['habitProgress']['targetDays'] > $days) throw new ApiException(422, 'validation_error', 'Target exceeds the goal date window.');
    }
    $goal['updatedAt'] = api_now();
    return $goal;
}

function goals_api(StateStore $store, string $method, ?string $id, array $body, ?PDO $db = null): array
{
    api_method($id === null ? ['GET', 'POST'] : ['GET', 'PATCH', 'DELETE'], $method);
    if ($method === 'GET') {
        $goals = $store->get(GOALS_KEY, ['goals' => []])['goals'];
        $goals = array_map(fn ($g) => array_merge($g, ['progress' => goals_progress($g, $db), 'effectiveStatus' => goals_status($g, $db)]), $goals);
        if ($id === null) return $goals;
        foreach ($goals as $goal) if ((string) $goal['id'] === $id) return $goal;
        throw new ApiException(404, 'not_found', 'Goal not found.');
    }
    if ($db && isset($body['habitProgress']['habitId'])) {
        $query = $db->prepare('SELECT id FROM habits WHERE user_id = ' . life_os_user_id() . ' AND id = ?');
        $query->execute([$body['habitProgress']['habitId']]);
        if ($query->fetchColumn() === false) throw new ApiException(422, 'validation_error', 'Linked habit does not exist.');
    }
    return $store->mutate([GOALS_KEY => ['goals' => []]], function (array &$docs) use ($method, $id, $body) {
        $goals =& $docs[GOALS_KEY]['goals'];
        if ($method === 'POST') { $goal = goals_validate($body, [], true); $goals[] = $goal; return $goal; }
        foreach ($goals as $index => &$goal) {
            if ((string) $goal['id'] !== $id) continue;
            if ($method === 'DELETE') { array_splice($goals, $index, 1); return ['deleted' => true]; }
            $goal = goals_validate($body, $goal);
            return $goal;
        }
        throw new ApiException(404, 'not_found', 'Goal not found.');
    });
}
