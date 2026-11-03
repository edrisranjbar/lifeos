<?php
declare(strict_types=1);

function notepad_record_snapshot(PDO $db, int $user, array $note, string $event): void
{
    if (!is_string($note['id'] ?? null)) return;
    $snapshot = json_encode($note, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    $hash = hash('sha256', json_encode([$note['title'] ?? '', $note['body'] ?? '', $note['format'] ?? 'markdown'], JSON_THROW_ON_ERROR));
    $last = $db->prepare('SELECT content_hash, event FROM notepad_revisions WHERE user_id = ? AND note_id = ? ORDER BY id DESC LIMIT 1');
    $last->execute([$user, $note['id']]);
    $previous = $last->fetch();
    if ($previous && $previous['content_hash'] === $hash && $previous['event'] === $event) return;
    $db->prepare('INSERT INTO notepad_revisions (user_id,note_id,title,snapshot,content_hash,event,created_at) VALUES (?,?,?,?,?,?,?)')
        ->execute([$user,$note['id'],(string) ($note['title'] ?? ''),$snapshot,$hash,$event,(new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.u\Z')]);
}

/** Called inside the same transaction as every browser/API state write. */
function notepad_capture_revisions(PDO $db, ?string $before, string $after): void
{
    $old = json_decode($before ?? '{}', true, 64, JSON_THROW_ON_ERROR);
    $new = json_decode($after, true, 64, JSON_THROW_ON_ERROR);
    if (!is_array($new) || !is_array($new['notes'] ?? null)) throw new ApiException(422, 'invalid_notepad', 'Invalid Notepad document.');
    $oldNotes = [];
    foreach (($old['notes'] ?? []) as $note) if (is_array($note) && is_string($note['id'] ?? null)) $oldNotes[$note['id']] = $note;
    $newNotes = [];
    foreach ($new['notes'] as $note) {
        if (!is_array($note) || !is_string($note['id'] ?? null) || isset($newNotes[$note['id']])) throw new ApiException(422, 'invalid_notepad', 'Invalid or duplicate note ID.');
        $newNotes[$note['id']] = $note;
    }
    // Legacy single-note content must survive its first conversion as well.
    if (!$oldNotes && is_string($old['body'] ?? null) && $old['body'] !== '') {
        $first = array_key_first($newNotes) ?? 'legacy-notepad';
        $oldNotes[$first] = ['id'=>$first,'title'=>'My note','body'=>$old['body'],'format'=>'markdown'];
    }
    foreach ($oldNotes as $id => $note) notepad_record_snapshot($db, life_os_user_id(), $note, 'saved');
    foreach ($newNotes as $note) notepad_record_snapshot($db, life_os_user_id(), $note, 'saved');
    foreach (array_diff_key($oldNotes, $newNotes) as $note) notepad_record_snapshot($db, life_os_user_id(), $note, 'deleted');
}
