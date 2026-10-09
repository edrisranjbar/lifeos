// Synchronous in-memory reads preserve the existing app APIs. MySQL is the
// durable store; writes are serialized so rapid edits cannot arrive out of order.
(() => {
  const keys = [
    'edi_focus_v1', 'daramd_periods_v1', 'daramd_active_period_v1', 'daramd_v1',
    'kanban_boards_v1', 'edi_goals_v1', 'edi_goals_drafts_v1', 'edi_notes_v1', 'edi_notepad_v1', 'edi_growth_v1', 'edi_obligations_v1',
    'edi_os_theme', 'edifinance_theme', 'habittify_theme',
    'edi_kanban_theme', 'edi_goals_theme', 'edi_notes_theme'
  ];
  const cache = new Map();
  const revisions = new Map();
  const conflicts = new Set();
  const failedWrites = new Set();
  // Keys with in-flight writes, and a per-key edit counter, keep sync() from
  // replacing local edits with an older server copy.
  const pending = new Map();
  const edits = new Map();
  const track = (key, delta) => { const n = (pending.get(key) || 0) + delta; if (n > 0) pending.set(key, n); else pending.delete(key); };
  let syncing = null;
  let csrf = '';
  let writes = Promise.resolve();
  let errorShown = false;
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('edi-life-os-state') : null;
  if (channel) channel.onmessage = ({data}) => {
    if (data?.updates && typeof data.updates === 'object') {
      const entries = Object.entries(data.updates);
      if (!entries.length || entries.some(([key, item]) => !keys.includes(key) || typeof item?.value !== 'string' || !/^[a-f0-9]{64}$/.test(item?.revision || '') || pending.has(key) || conflicts.has(key) || failedWrites.has(key))) return;
      for (const [key, item] of entries) {
        cache.set(key, item.value); revisions.set(key, item.revision);
        edits.set(key, (edits.get(key) || 0) + 1);
      }
      dispatchEvent(new Event('app-storage-change'));
      return;
    }
    if (keys.includes(data?.key) && typeof data.value === 'string') {
      cache.set(data.key, data.value);
      dispatchEvent(new Event('app-storage-change'));
    }
  };

  function showError(conflict = false) {
    if (errorShown) return;
    errorShown = true;
    const message = document.createElement('div');
    message.setAttribute('role', 'alert');
    message.textContent = conflict ? 'Data changed in another client. Your latest edits were not saved. Copy them, then reload before editing again.' : 'Unable to save to MySQL. Check the server configuration or connection, then reload.';
    Object.assign(message.style, {position:'fixed', bottom:'12px', left:'12px', right:'12px', zIndex:'9999', padding:'12px 16px', background:'#7f1d1d', color:'white', borderRadius:'8px'});
    if (document.body) document.body.append(message);
    else addEventListener('DOMContentLoaded', () => document.body.append(message), {once:true});
  }

  async function save(key, value) {
    if (conflicts.has(key)) throw new Error('Reload before saving this document again.');
    const response = await fetch('/state.php', {
      method: 'PUT',
      redirect: 'error',
      headers: {'Content-Type':'application/json', 'X-CSRF-Token':csrf},
      body: JSON.stringify({key, value, revision:revisions.get(key) ?? null})
    });
    if (response.status === 409) { conflicts.add(key); showError(true); throw new Error('State conflict: save stopped.'); }
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(`MySQL save failed (${response.status})`);
    revisions.set(key, result.revision);
    failedWrites.delete(key);
  }

  window.appStorage = {
    getItem(key) { return cache.has(key) ? cache.get(key) : null; },
    // Session CSRF token for apps that write to their own endpoints.
    async csrfToken() { await window.appStorageReady; return csrf; },
    setItem(key, value) {
      if (!keys.includes(key)) throw new Error('Unknown storage key');
      const text = String(value);
      cache.set(key, text);
      edits.set(key, (edits.get(key) || 0) + 1);
      track(key, 1);
      channel?.postMessage({key, value:text});
      dispatchEvent(new Event('app-storage-change'));
      writes = writes.then(() => save(key, text)).catch(error => { failedWrites.add(key); console.error(error); showError(); }).finally(() => track(key, -1));
    },
    mutateItem(key, operation) {
      if (!keys.includes(key)) throw new Error('Unknown storage key');
      track(key, 1);
      const mutation = writes.then(async () => {
        if (conflicts.has(key) || failedWrites.has(key)) throw new Error('Your latest edits could not be saved. Copy them and reload before moving the card.');
        const result = await operation({csrf, revision:revisions.get(key) ?? null});
        if (typeof result?.value !== 'string' || !/^[a-f0-9]{64}$/.test(result?.revision || '')) throw new Error('Invalid save response. Reload before editing again.');
        cache.set(key, result.value);
        revisions.set(key, result.revision);
        edits.set(key, (edits.get(key) || 0) + 1);
        channel?.postMessage({key, value:result.value});
        dispatchEvent(new Event('app-storage-change'));
        return result.value;
      });
      writes = mutation.catch(error => {
        if (error.stateConflict) { conflicts.add(key); showError(true); }
      }).finally(() => track(key, -1));
      return mutation;
    },
    // Multi-document backend mutations (a payment and its expense) share the
    // same queue as ordinary saves and publish all returned documents together.
    mutateItems(affectedKeys, operation) {
      const affected = [...new Set(affectedKeys)];
      if (!affected.length || affected.some(key => !keys.includes(key))) throw new Error('Unknown storage key');
      affected.forEach(key => track(key, 1));
      const mutation = writes.then(async () => {
        if (affected.some(key => conflicts.has(key) || failedWrites.has(key))) throw new Error('Your latest edits could not be saved. Reload before recording a payment.');
        const result = await operation({csrf, revisions:Object.fromEntries(affected.map(key => [key, revisions.get(key) ?? null]))});
        const updates = result?.updates;
        if (!updates || !Object.keys(updates).length || Object.entries(updates).some(([key, item]) => !affected.includes(key) || typeof item?.value !== 'string' || !/^[a-f0-9]{64}$/.test(item?.revision || ''))) throw new Error('Invalid save response. Reload before editing.');
        for (const [key, item] of Object.entries(updates)) {
          cache.set(key, item.value); revisions.set(key, item.revision);
          edits.set(key, (edits.get(key) || 0) + 1);
        }
        channel?.postMessage({updates});
        dispatchEvent(new Event('app-storage-change'));
        return result;
      });
      writes = mutation.catch(error => { if (error.stateConflict) { affected.forEach(key => conflicts.add(key)); showError(true); } }).finally(() => affected.forEach(key => track(key, -1)));
      return mutation;
    },
    // Pull changes made by other devices or clients; the cache is otherwise
    // only refreshed on page load.
    sync() {
      syncing ??= (async () => {
        await window.appStorageReady;
        const before = new Map(edits);
        const response = await fetch('/state.php', {headers:{Accept:'application/json'}, cache:'no-store', redirect:'error'});
        if (!response.ok) return;
        const payload = await response.json();
        let changed = false;
        for (const [key, value] of Object.entries(payload.data || {})) {
          const revision = payload.revisions?.[key];
          if (!keys.includes(key) || typeof value !== 'string' || revision === revisions.get(key)) continue;
          if (pending.has(key) || conflicts.has(key) || failedWrites.has(key) || edits.get(key) !== before.get(key)) continue;
          cache.set(key, value);
          revisions.set(key, revision);
          changed = true;
        }
        if (changed) dispatchEvent(new Event('app-storage-change'));
      })().catch(error => console.error(error)).finally(() => { syncing = null; });
      return syncing;
    }
  };

  window.appStorageReady = (async () => {
    const response = await fetch('/state.php', {headers:{Accept:'application/json'}, cache:'no-store', redirect:'error'});
    if (!response.ok) throw new Error(`MySQL load failed (${response.status})`);
    const payload = await response.json();
    csrf = payload.csrf;
    for (const [key, revision] of Object.entries(payload.revisions || {})) revisions.set(key, revision);
    for (const [key, value] of Object.entries(payload.data || {})) {
      if (keys.includes(key) && typeof value === 'string') cache.set(key, value);
    }
    // Archive divergent browser values in MySQL before clearing old copies.
    for (const key of keys) {
      let legacy;
      try { legacy = localStorage.getItem(key); } catch { continue; }
      if (legacy === null) continue;
      if (!cache.has(key)) {
        await save(key, legacy);
        cache.set(key, legacy);
      } else if (cache.get(key) !== legacy) {
        const backupKey = 'legacy_backup_' + Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
        await save(backupKey, JSON.stringify({key, value:legacy, importedAt:new Date().toISOString()}));
      }
      try { localStorage.removeItem(key); } catch { /* Storage may be unavailable. */ }
    }
  })().catch(error => { console.error(error); showError(); throw error; });
})();
