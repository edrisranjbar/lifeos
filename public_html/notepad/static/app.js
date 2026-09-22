const KEY = 'edi_notepad_v1';
const $ = id => document.getElementById(id);

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

function inline(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>');
}

function markdown(source) {
  if (!source.trim()) return '<p class="empty">Your rendered Markdown will appear here.</p>';
  const out = []; let list = ''; let code = false; let codeLines = [];
  const closeList = () => { if (list) { out.push(`</${list}>`); list = ''; } };
  for (const line of source.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s*```/.test(line)) { closeList(); if (code) { out.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`); codeLines = []; } code = !code; continue; }
    if (code) { codeLines.push(line); continue; }
    if (!line.trim()) { closeList(); continue; }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) { closeList(); const level = heading[1].length; out.push(`<h${level}>${inline(heading[2])}</h${level}>`); continue; }
    const bullet = line.match(/^\s*[-*+]\s+(.+)$/), numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (bullet || numbered) { const next = bullet ? 'ul' : 'ol'; if (list !== next) { closeList(); out.push(`<${next}>`); list = next; } out.push(`<li>${inline((bullet || numbered)[1])}</li>`); continue; }
    closeList(); const quote = line.match(/^>\s?(.*)$/); out.push(quote ? `<blockquote>${inline(quote[1])}</blockquote>` : `<p>${inline(line)}</p>`);
  }
  closeList(); if (code) out.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  return out.join('');
}

document.addEventListener('DOMContentLoaded', async () => {
  await window.appStorageReady;
  let body = '';
  try {
    const own = JSON.parse(appStorage.getItem(KEY));
    if (typeof own?.body === 'string') body = own.body;
    if (!body) {
      const legacy = JSON.parse(appStorage.getItem('edi_notes_v1'));
      if (typeof legacy?.notepad === 'string') body = legacy.notepad;
    }
  } catch {}
  const input = $('notepadInput'), preview = $('notepadPreview'), status = $('saveStatus'), shell = $('editorShell');
  input.value = body; preview.innerHTML = markdown(body);
  let timer;
  const save = () => { appStorage.setItem(KEY, JSON.stringify({body: input.value, updatedAt: Date.now()})); status.textContent = 'Saved'; };
  input.addEventListener('input', () => { preview.innerHTML = markdown(input.value); status.textContent = 'Saving…'; clearTimeout(timer); timer = setTimeout(save, 220); });
  input.addEventListener('blur', save);
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    shell.dataset.view = button.dataset.view;
    document.querySelectorAll('[data-view]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    if (button.dataset.view !== 'preview') input.focus();
  }));
});
