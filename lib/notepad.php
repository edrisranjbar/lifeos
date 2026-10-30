<?php

declare(strict_types=1);

const NOTEPAD_KEY = 'edi_notepad_v1';

function notepad_document(array $doc): array
{
    if (!isset($doc['notes'])) {
        $doc['notes'] = isset($doc['body']) && is_string($doc['body']) && $doc['body'] !== ''
            ? [['id' => 'legacy-notepad', 'title' => 'My note', 'body' => $doc['body'], 'format' => 'markdown', 'updatedAt' => 0]] : [];
    }
    if (!is_array($doc['notes'])) throw new ApiException(409, 'invalid_document', 'Unable to read Notepad documents.');
    return $doc;
}

function notepad_validate(array $body, array $existing = []): array
{
    api_fields($body, ['title', 'body', 'format']);
    $note = $existing ?: ['id' => api_uuid(), 'title' => 'Untitled note', 'body' => '', 'format' => 'markdown'];
    foreach ($body as $key => $value) {
        $note[$key] = $key === 'format' ? api_enum($value, 'format', ['markdown', 'html'])
            : api_text($value, $key, $key === 'title' ? 100 : 100000);
    }
    $note['format'] ??= 'markdown';
    $note['updatedAt'] = api_now();
    return $note;
}

function notepad_api(StateStore $store, string $method, ?string $id, array $body): array
{
    api_method($id === null ? ['GET', 'POST'] : ['GET', 'PATCH', 'DELETE'], $method);
    if ($method === 'GET') {
        $doc = notepad_document($store->get(NOTEPAD_KEY, ['notes' => [], 'sort' => 'manual']));
        $notes = array_map(fn ($note) => $note + ['format' => 'markdown'], $doc['notes']);
        if ($id === null) return array_values($notes);
        foreach ($notes as $note) if ((string) $note['id'] === $id) return $note;
        throw new ApiException(404, 'not_found', 'Notepad document not found.');
    }
    return $store->mutate([NOTEPAD_KEY => ['notes' => [], 'sort' => 'manual']], function (array &$docs) use ($method, $id, $body): array {
        $docs[NOTEPAD_KEY] = notepad_document($docs[NOTEPAD_KEY]);
        $doc =& $docs[NOTEPAD_KEY];
        if ($method === 'POST') {
            if (count($doc['notes']) >= 1000) throw new ApiException(422, 'limit_reached', 'Notepad supports at most 1000 documents.');
            $note = notepad_validate($body);
            $doc['notes'][] = $note;
            $doc['activeId'] ??= $note['id'];
            $result = $note;
        } else {
            $index = null;
            foreach ($doc['notes'] as $key => $note) if ((string) $note['id'] === $id) { $index = $key; break; }
            if ($index === null) throw new ApiException(404, 'not_found', 'Notepad document not found.');
            if ($method === 'DELETE') {
                api_fields($body, []);
                array_splice($doc['notes'], $index, 1);
                if (($doc['activeId'] ?? null) === $id) $doc['activeId'] = $doc['notes'][0]['id'] ?? null;
                $result = ['deleted' => true, 'id' => $id];
            } else {
                $doc['notes'][$index] = notepad_validate($body, $doc['notes'][$index]);
                $result = $doc['notes'][$index];
            }
        }
        if (strlen(json_encode($doc, JSON_THROW_ON_ERROR)) > 1900000) throw new ApiException(422, 'limit_reached', 'Notepad storage limit reached.');
        return $result;
    });
}
