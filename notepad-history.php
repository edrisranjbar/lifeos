<?php
declare(strict_types=1);
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/lib/state_store.php';
life_os_require_auth();
header('Cache-Control: private, no-store');
header('X-Content-Type-Options: nosniff');
try {
    $db = life_os_db(); $user = life_os_user_id();
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($method === 'GET') {
        if (isset($_GET['revision'])) {
            $q = $db->prepare('SELECT id,note_id,snapshot,created_at,event FROM notepad_revisions WHERE user_id = ? AND id = ?');
            $q->execute([$user,(string) $_GET['revision']]); $row = $q->fetch();
            if (!$row) throw new ApiException(404,'not_found','Revision not found.');
            $row['note'] = json_decode($row['snapshot'], true, 64, JSON_THROW_ON_ERROR); unset($row['snapshot']);
            life_os_json_reply($row);
        }
        if (isset($_GET['note'])) {
            $before = ctype_digit((string) ($_GET['before'] ?? '')) ? (string) $_GET['before'] : '18446744073709551615';
            $q = $db->prepare('SELECT id,title,event,created_at FROM notepad_revisions WHERE user_id = ? AND note_id = ? AND id < ? ORDER BY id DESC LIMIT 50');
            $q->execute([$user,(string) $_GET['note'],$before]); life_os_json_reply(['revisions'=>$q->fetchAll()]);
        }
        $q = $db->prepare('SELECT r.note_id,r.title FROM notepad_revisions r INNER JOIN (SELECT MAX(id) AS latest FROM notepad_revisions WHERE user_id = ? GROUP BY note_id) x ON r.id = x.latest WHERE r.user_id = ? ORDER BY r.id DESC');
        $q->execute([$user,$user]); life_os_json_reply(['documents'=>$q->fetchAll()]);
    }
    if ($method !== 'POST') { header('Allow: GET, POST'); throw new ApiException(405,'method_not_allowed','Method not allowed.'); }
    life_os_require_csrf(fn () => life_os_json_reply(['error'=>'Invalid request token'],403));
    $raw = file_get_contents('php://input');
    if (strlen($raw) > 4096) throw new ApiException(413,'too_large','Request too large.');
    $body = json_decode($raw, true, 16, JSON_THROW_ON_ERROR);
    if (!array_key_exists('expectedRevision',$body) || !is_string($body['expectedRevision']) || !preg_match('/^[a-f0-9]{64}$/D',$body['expectedRevision'])) throw new ApiException(409,'state_conflict','Reload before restoring.');
    $q = $db->prepare('SELECT snapshot FROM notepad_revisions WHERE user_id = ? AND id = ?');
    $q->execute([$user,(string) ($body['revision'] ?? '')]); $snapshot = $q->fetchColumn();
    if ($snapshot === false) throw new ApiException(404,'not_found','Revision not found.');
    $note = json_decode($snapshot, true, 64, JSON_THROW_ON_ERROR);
    $store = new StateStore($db);
    $value = $store->mutate(['edi_notepad_v1'=>['notes'=>[]]],function(array &$docs) use ($note): string {
        $doc =& $docs['edi_notepad_v1']; $found = false; $restored = $note; $restored['updatedAt'] = (int) round(microtime(true)*1000);
        foreach ($doc['notes'] as &$item) if ($item['id'] === $note['id']) { $item = $restored; $found = true; break; }
        unset($item);
        if (!$found) $doc['notes'][] = $restored;
        $doc['activeId'] = $note['id'];
        return json_encode($doc, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR);
    },['edi_notepad_v1'=>$body['expectedRevision']]);
    // Read the committed representation; unknown metadata container types are preserved by StateStore.
    $raw = $store->raw('edi_notepad_v1');
    life_os_json_reply(['ok'=>true,'value'=>$raw,'revision'=>hash('sha256',$raw)]);
} catch (ApiException $e) { life_os_json_reply(['error'=>$e->getMessage()],$e->status); }
catch (Throwable $e) { error_log('Notepad history: '.get_class($e)); life_os_json_reply(['error'=>'Unable to access revision history.'],503); }
