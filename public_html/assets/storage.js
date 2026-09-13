// Synchronous in-memory reads preserve the existing app APIs. MySQL is the
// durable store; writes are serialized so rapid edits cannot arrive out of order.
(() => {
  const keys = [
    'edi_focus_v1', 'daramd_periods_v1', 'daramd_active_period_v1', 'daramd_v1',
    'kanban_boards_v1', 'edi_goals_v1', 'edi_notes_v1',
    'edi_os_theme', 'edifinance_theme', 'habittify_theme',
    'edi_kanban_theme', 'edi_goals_theme', 'edi_notes_theme'
  ];
  const cache = new Map();
  let csrf = '';
  let writes = Promise.resolve();
  let errorShown = false;
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('edi-life-os-state') : null;
  if (channel) channel.onmessage = ({data}) => {
    if (keys.includes(data?.key) && typeof data.value === 'string') {
      cache.set(data.key, data.value);
      dispatchEvent(new Event('app-storage-change'));
    }
  };

  function showError() {
    if (errorShown) return;
    errorShown = true;
    const message = document.createElement('div');
    message.setAttribute('role', 'alert');
    message.textContent = 'Unable to save to MySQL. Check the server configuration or connection, then reload.';
    Object.assign(message.style, {position:'fixed', bottom:'12px', left:'12px', right:'12px', zIndex:'9999', padding:'12px 16px', background:'#7f1d1d', color:'white', borderRadius:'8px'});
    if (document.body) document.body.append(message);
    else addEventListener('DOMContentLoaded', () => document.body.append(message), {once:true});
  }

  async function save(key, value) {
    const response = await fetch('/state.php', {
      method: 'PUT',
      redirect: 'error',
      headers: {'Content-Type':'application/json', 'X-CSRF-Token':csrf},
      body: JSON.stringify({key, value})
    });
    if (!response.ok || !(await response.json()).ok) throw new Error(`MySQL save failed (${response.status})`);
  }

  window.appStorage = {
    getItem(key) { return cache.has(key) ? cache.get(key) : null; },
    setItem(key, value) {
      if (!keys.includes(key)) throw new Error('Unknown storage key');
      const text = String(value);
      cache.set(key, text);
      channel?.postMessage({key, value:text});
      dispatchEvent(new Event('app-storage-change'));
      writes = writes.then(() => save(key, text)).catch(error => { console.error(error); showError(); });
    }
  };

  window.appStorageReady = (async () => {
    const response = await fetch('/state.php', {headers:{Accept:'application/json'}, cache:'no-store', redirect:'error'});
    if (!response.ok) throw new Error(`MySQL load failed (${response.status})`);
    const payload = await response.json();
    csrf = payload.csrf;
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
