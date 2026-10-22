<?php

declare(strict_types=1);

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/lib/state_store.php';
require_once __DIR__ . '/lib/kanban_goal.php';
life_os_require_auth();

try {
    api_method(['POST'], $_SERVER['REQUEST_METHOD'] ?? 'GET');
    life_os_require_csrf(fn () => throw new ApiException(403, 'invalid_request_token', 'Invalid request token. Reload and try again.'));
    $body = api_body();
    if (($body['action'] ?? null) === 'to_goal') api_json(kanban_card_to_goal(new StateStore(life_os_db()), life_os_db(), $body));
    api_fields($body, ['source_board_id', 'source_column_id', 'card_id', 'destination_board_id', 'destination_column_id', 'revision']);
    foreach (['source_board_id', 'source_column_id', 'card_id', 'destination_board_id', 'destination_column_id'] as $field) {
        $body[$field] = api_text($body[$field] ?? '', $field, 100, true);
    }
    $revision = $body['revision'] ?? null;
    if (!is_string($revision) || !preg_match('/^[a-f0-9]{64}$/D', $revision)) throw new ApiException(422, 'validation_error', 'A saved project revision is required.');
    if ($body['source_board_id'] === $body['destination_board_id']) throw new ApiException(422, 'validation_error', 'Choose another project.');

    $db = life_os_db();
    $store = new StateStore($db);
    $store->mutate(['kanban_boards_v1' => ['boards' => []]], function (array &$documents) use ($body, $revision, $store, $db): void {
        if (!hash_equals($revision, hash('sha256', $store->raw('kanban_boards_v1') ?? ''))) throw new ApiException(409, 'state_conflict', 'Project data changed elsewhere. Reload before moving this card.');
        $document =& $documents['kanban_boards_v1'];
        $from = $to = null;
        foreach ($document['boards'] as $index => $board) {
            if ($board['id'] === $body['source_board_id']) $from = $index;
            if ($board['id'] === $body['destination_board_id']) $to = $index;
        }
        if ($from === null || $to === null) throw new ApiException(404, 'not_found', 'Project not found.');
        $source =& $document['boards'][$from];
        $target =& $document['boards'][$to];
        $sourceColumn = $targetColumn = $cardIndex = null;
        foreach ($source['columns'] as $index => $column) if ($column['id'] === $body['source_column_id']) $sourceColumn = $index;
        foreach ($target['columns'] as $index => $column) {
            if ($column['id'] === $body['destination_column_id']) $targetColumn = $index;
            foreach ($column['cards'] as $card) if ($card['id'] === $body['card_id']) throw new ApiException(409, 'card_conflict', 'The destination already contains a card with this ID.');
        }
        if ($sourceColumn === null || $targetColumn === null) throw new ApiException(404, 'not_found', 'List not found.');
        foreach ($source['columns'][$sourceColumn]['cards'] as $index => $card) if ($card['id'] === $body['card_id']) $cardIndex = $index;
        if ($cardIndex === null) throw new ApiException(404, 'not_found', 'Card not found.');

        $card = $source['columns'][$sourceColumn]['cards'][$cardIndex];
        $target['labelDefs'] ??= [];
        foreach ($card['labelIds'] ?? [] as $index => $labelId) {
            $definition = null;
            foreach ($source['labelDefs'] ?? [] as $label) if ($label['id'] === $labelId) $definition = $label;
            if ($definition === null) continue;
            $matching = null;
            foreach ($target['labelDefs'] as $label) {
                if (($label['name'] ?? '') === ($definition['name'] ?? '') && ($label['color'] ?? '') === ($definition['color'] ?? '')) { $matching = $label['id']; break; }
            }
            if ($matching === null) {
                $definition['id'] = api_uuid();
                $target['labelDefs'][] = $definition;
                $matching = $definition['id'];
            }
            $card['labelIds'][$index] = $matching;
        }
        $card['updatedAt'] = api_now();
        array_splice($source['columns'][$sourceColumn]['cards'], $cardIndex, 1);
        $target['columns'][$targetColumn]['cards'][] = $card;
        $document['activeBoardId'] = $target['id'];

        // Files keep their IDs and disk locations; only their project association moves.
        $table = $db->prepare('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?');
        $table->execute(['card_attachments']);
        if ((int) $table->fetchColumn() > 0) {
            $moveFiles = $db->prepare('UPDATE card_attachments SET board_id = ? WHERE user_id = ' . life_os_user_id() . ' AND board_id = ? AND card_id = ?');
            $moveFiles->execute([$target['id'], $source['id'], $card['id']]);
        }
    });
    $value = $store->raw('kanban_boards_v1');
    api_json(['value' => $value, 'revision' => hash('sha256', $value ?? '')]);
} catch (ApiException $error) {
    api_error($error->status, $error->errorCode, $error->getMessage());
} catch (Throwable $error) {
    error_log('LifeOS card move failed: ' . get_class($error));
    api_error(503, 'move_failed', 'Unable to move the card. Please try again.');
}
