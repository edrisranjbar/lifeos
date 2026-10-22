<?php

declare(strict_types=1);

require_once __DIR__ . '/state_store.php';
require_once __DIR__ . '/goals.php';

/** Turn a card into a checklist goal and remove it from its list, in one transaction. */
function kanban_card_to_goal(StateStore $store, PDO $db, array $body): array
{
    api_fields($body, ['action', 'board_id', 'column_id', 'card_id', 'revisions']);
    foreach (['board_id', 'column_id', 'card_id'] as $field) $body[$field] = api_text($body[$field] ?? '', $field, 100, true);
    $revisions = $body['revisions'] ?? null;
    if (!is_array($revisions)) throw new ApiException(422, 'validation_error', 'Saved revisions are required.');
    foreach (['kanban_boards_v1', GOALS_KEY] as $key) {
        $revision = $revisions[$key] ?? null;
        if ($revision !== null && (!is_string($revision) || !preg_match('/^[a-f0-9]{64}$/D', $revision))) throw new ApiException(422, 'validation_error', 'Invalid saved revision.');
    }
    if (!isset($revisions['kanban_boards_v1'])) throw new ApiException(422, 'validation_error', 'A saved project revision is required.');

    $defaults = ['kanban_boards_v1' => ['boards' => []], GOALS_KEY => ['goals' => []]];
    $goal = $store->mutate($defaults, function (array &$documents) use ($body, $db): array {
        $card = $boardName = $columnName = null;
        $labels = [];
        foreach ($documents['kanban_boards_v1']['boards'] as &$board) {
            if (($board['id'] ?? '') !== $body['board_id']) continue;
            foreach ($board['columns'] as &$column) {
                if (($column['id'] ?? '') !== $body['column_id']) continue;
                foreach ($column['cards'] as $index => $item) {
                    if (($item['id'] ?? '') !== $body['card_id']) continue;
                    $card = $item;
                    $boardName = (string) ($board['name'] ?? 'Project');
                    $columnName = (string) ($column['name'] ?? 'List');
                    $labels = [];
                    foreach ($item['labelIds'] ?? [] as $labelId) foreach ($board['labelDefs'] ?? [] as $label) if (($label['id'] ?? '') === $labelId && ($label['name'] ?? '') !== '') $labels[] = $label['name'];
                    array_splice($column['cards'], $index, 1);
                    break 3;
                }
            }
        }
        unset($board, $column);
        if ($card === null) throw new ApiException(404, 'not_found', 'Card not found. Reload the board and try again.');

        $table = $db->prepare($db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql'
            ? 'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?'
            : "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?");
        $table->execute(['card_attachments']);
        if ((int) $table->fetchColumn() > 0) {
            $files = $db->prepare('SELECT COUNT(*) FROM card_attachments WHERE user_id = ' . life_os_user_id() . ' AND board_id = ? AND card_id = ?');
            $files->execute([$body['board_id'], $card['id']]);
            if ((int) $files->fetchColumn() > 0) throw new ApiException(409, 'card_has_attachments', 'Goals cannot hold files. Download or remove this card’s attachments first.');
        }

        $items = [];
        foreach (is_array($card['checklists'] ?? null) ? $card['checklists'] : [['items' => $card['checklist'] ?? []]] as $list) {
            foreach ($list['items'] ?? [] as $item) {
                $text = trim((string) ($item['text'] ?? ''));
                if ($text !== '') $items[] = ['title' => mb_substr($text, 0, 500), 'done' => ($item['done'] ?? false) === true];
            }
        }
        $date = function (mixed $value): ?string {
            try { return is_string($value) ? api_date($value, 'date') : null; } catch (ApiException) { return null; }
        };
        $deadline = $date($card['dueDate'] ?? null);
        $start = $date($card['startDate'] ?? null);
        if ($start !== null && $deadline !== null && $start > $deadline) $start = null;
        $notes = "Moved from Kanban: $boardName → $columnName.";
        if ($labels) $notes .= "\nLabels: " . implode(', ', $labels);
        $goal = goals_validate([
            'title' => mb_substr(trim((string) ($card['title'] ?? '')) ?: 'Untitled goal', 0, 200),
            'specific' => mb_substr((string) ($card['description'] ?? ''), 0, 20000),
            'priority' => in_array($card['priority'] ?? '', ['low', 'medium', 'high'], true) ? $card['priority'] : 'medium',
            'deadline' => $deadline,
            'startDate' => $start,
            'notes' => $notes,
            'progressSource' => 'checklist',
            'tasks' => $items,
        ], [], true);
        $documents[GOALS_KEY]['goals'][] = $goal;
        return $goal;
    }, $revisions + [GOALS_KEY => null]);

    $updates = [];
    foreach (array_keys($defaults) as $key) {
        $raw = $store->raw($key);
        if ($raw !== null) $updates[$key] = ['value' => $raw, 'revision' => hash('sha256', $raw)];
    }
    return ['result' => ['goalId' => $goal['id'], 'title' => $goal['title']], 'updates' => $updates];
}
