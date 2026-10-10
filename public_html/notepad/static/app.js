const KEY = 'edi_notepad_v1';
const $ = id => document.getElementById(id);

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

// Ignore code and link destinations when choosing the note's main writing direction.
function noteDirection(source) {
  const prose = source.replace(/```[\s\S]*?(?:```|$)/g, '')
    .replace(/`[^`]*`/g, '').replace(/\]\(https?:\/\/[^\s)]+\)/g, ']');
  const letters = prose.match(/\p{L}/gu) || [];
  const rtl = letters.filter(letter => /[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(letter)).length;
  return rtl > letters.length / 2 ? 'rtl' : 'ltr';
}

function inline(value) {
  const tokens = [];
  const protect = html => `\u0000${tokens.push(html) - 1}\u0000`;
  return escapeHtml(value).replace(/\u0000/g, '')
    .replace(/`([^`]+)`/g, (_, code) => protect(`<code>${code}</code>`))
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, text, url) => protect(`<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`))
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/\u0000(\d+)\u0000/g, (_, index) => tokens[Number(index)]);
}

function markdown(source) {
  if (!source.trim()) return '<p class="empty">Your rendered Markdown will appear here.</p>';
  const out = []; let list = ''; let code = false; let codeLines = [];
  const closeList = () => { if (list) { out.push(`</${list}>`); list = ''; } };
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const cells = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (/^\s*```/.test(line)) { closeList(); if (code) { out.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`); codeLines = []; } code = !code; continue; }
    if (code) { codeLines.push(line); continue; }
    if (!line.trim()) { closeList(); continue; }
    if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line)) { closeList(); out.push('<hr>'); continue; }
    if (line.includes('|') && lines[index + 1] && cells(lines[index + 1]).every(cell => /^:?-{3,}:?$/.test(cell))) {
      closeList();
      const headers = cells(line), separators = cells(lines[++index]);
      const align = column => separators[column]?.startsWith(':') && separators[column]?.endsWith(':') ? 'center' : separators[column]?.endsWith(':') ? 'right' : separators[column]?.startsWith(':') ? 'left' : 'start';
      out.push(`<div class="md-table-wrap"><table><thead><tr>${headers.map((cell, column) => `<th dir="auto" style="text-align:${align(column)}">${inline(cell)}</th>`).join('')}</tr></thead><tbody>`);
      while (lines[index + 1]?.trim() && lines[index + 1].includes('|')) {
        const row = cells(lines[++index]);
        out.push(`<tr>${headers.map((_, column) => `<td dir="auto" style="text-align:${align(column)}">${inline(row[column] || '')}</td>`).join('')}</tr>`);
      }
      out.push('</tbody></table></div>');
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) { closeList(); const level = heading[1].length; out.push(`<h${level} dir="auto">${inline(heading[2])}</h${level}>`); continue; }
    const bullet = line.match(/^\s*[-*+]\s+(.+)$/), numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (bullet || numbered) {
      const next = bullet ? 'ul' : 'ol';
      if (list !== next) { closeList(); out.push(`<${next}>`); list = next; }
      const body = (bullet || numbered)[1], task = bullet && body.match(/^\[([ xX])\]\s*(.*)$/);
      out.push(task ? `<li class="md-task" dir="auto"><input type="checkbox" data-task-line="${index}" aria-label="${escapeHtml(task[2])}" ${task[1] !== ' ' ? 'checked' : ''}><span>${inline(task[2])}</span></li>` : `<li dir="auto">${inline(body)}</li>`);
      continue;
    }
    closeList(); const quote = line.match(/^>\s?(.*)$/); out.push(quote ? `<blockquote dir="auto">${inline(quote[1])}</blockquote>` : `<p dir="auto">${inline(line)}</p>`);
  }
  closeList(); if (code) out.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  return out.join('');
}

document.addEventListener('DOMContentLoaded', async () => {
  await window.appStorageReady;
  let saved;
  try {
    saved = JSON.parse(appStorage.getItem(KEY));
    if (!Array.isArray(saved?.notes)) {
      let body = typeof saved?.body === 'string' ? saved.body : '';
      if (!body) {
      const legacy = JSON.parse(appStorage.getItem('edi_notes_v1'));
      if (typeof legacy?.notepad === 'string') body = legacy.notepad;
      }
      saved = {notes: [{id: crypto.randomUUID(), title: 'My note', body, updatedAt: Date.now()}], sort: 'manual'};
    }
  } catch {}
  const input = $('notepadInput'), preview = $('notepadPreview'), status = $('saveStatus'), shell = $('editorShell');
  const titleInput = $('noteTitle'), tabs = $('noteTabs'), sortInput = $('noteSort');
  const renderPreview = () => {
    input.dir = noteDirection(input.value);
    preview.dir = input.dir;
    preview.innerHTML = markdown(input.value);
  };
  const data = saved && Array.isArray(saved.notes) ? saved : {notes: [], sort: 'manual'};
  data.notes = data.notes.filter(note => note && typeof note.id === 'string');
  if (!data.notes.length) data.notes.push({id: crypto.randomUUID(), title: 'My note', body: '', updatedAt: Date.now()});
  data.notes = data.notes.map(note => ({
    id: note.id,
    title: typeof note.title === 'string' ? note.title : 'Untitled note',
    body: typeof note.body === 'string' ? note.body : '',
    updatedAt: Number(note.updatedAt) || Date.now(),
  }));
  data.sort = ['manual', 'title', 'recent'].includes(data.sort) ? data.sort : 'manual';
  data.activeId = data.notes.some(note => note.id === data.activeId) ? data.activeId : data.notes[0].id;
  let saveTimer;
  let draggedId = null;
  function updateWritingStats() {
    const text = input.value;
    const words = text.trim() ? text.trim().split(/\s+/u).length : 0;
    $('writingStats').textContent = `${words.toLocaleString()} words · ${Array.from(text).length.toLocaleString()} characters`;
    const before = text.slice(0, input.selectionStart).split('\n');
    $('cursorPosition').textContent = `Ln ${before.length}, Col ${Array.from(before.at(-1)).length + 1}`;
  }
  const activeNote = () => data.notes.find(note => note.id === data.activeId);
  const save = () => {
    clearTimeout(saveTimer);
    const note = activeNote();
    if (note) note.body = input.value;
    try {
      appStorage.setItem(KEY, JSON.stringify(data));
      status.textContent = 'Saved';
    } catch {
      status.textContent = 'Save failed';
    }
  };
  const queueSave = () => {
    status.textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 220);
  };
  const orderedNotes = () => {
    const notes = [...data.notes];
    if (data.sort === 'title') notes.sort((a, b) => displayTitle(a).localeCompare(displayTitle(b), undefined, {sensitivity: 'base'}));
    if (data.sort === 'recent') notes.sort((a, b) => b.updatedAt - a.updatedAt);
    return notes;
  };
  const displayTitle = note => note.title.trim() || 'Untitled note';
  const renderTabs = () => {
    tabs.innerHTML = orderedNotes().map((note, index, notes) => `
      <li class="note-tab ${note.id === data.activeId ? 'active' : ''}" data-note-id="${escapeHtml(note.id)}" draggable="${data.sort === 'manual'}">
        <button type="button" class="note-tab-open" data-open-note="${escapeHtml(note.id)}" aria-current="${note.id === data.activeId ? 'page' : 'false'}" title="${escapeHtml(displayTitle(note))}">
          <span class="note-tab-name" dir="auto">${escapeHtml(displayTitle(note))}</span><span class="note-tab-preview" dir="${noteDirection(note.body)}">${escapeHtml(note.body.split(/\r?\n/).find(line => line.trim()) || 'Empty note')}</span>
        </button>
        <span class="note-tab-actions">
          <button type="button" data-move-note="up" data-note-id="${escapeHtml(note.id)}" aria-label="Move ${escapeHtml(displayTitle(note))} up" ${data.sort !== 'manual' || index === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" data-move-note="down" data-note-id="${escapeHtml(note.id)}" aria-label="Move ${escapeHtml(displayTitle(note))} down" ${data.sort !== 'manual' || index === notes.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" data-delete-note="${escapeHtml(note.id)}" aria-label="Delete ${escapeHtml(displayTitle(note))}" ${data.notes.length === 1 ? 'disabled' : ''}>×</button>
        </span>
      </li>`).join('');
  };
  const openNote = id => {
    const note = data.notes.find(item => item.id === id);
    if (!note) return;
    clearTimeout(saveTimer);
    const previous = activeNote();
    if (previous) previous.body = input.value;
    data.activeId = id;
    titleInput.value = note.title;
    input.value = note.body;
    renderPreview();
    updateWritingStats();
    renderTabs();
    status.textContent = 'Saved';
    try { appStorage.setItem(KEY, JSON.stringify(data)); } catch {}
  };
  const reorderNote = (id, direction) => {
    if (data.sort !== 'manual') return;
    const index = data.notes.findIndex(note => note.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= data.notes.length) return;
    [data.notes[index], data.notes[target]] = [data.notes[target], data.notes[index]];
    renderTabs();
    save();
  };

  const voiceButton = window.addVoiceInputButton(input, 'notepad-voice-input');
  document.querySelector('.write-pane').append(voiceButton);
  sortInput.value = data.sort;
  input.value = activeNote().body;
  titleInput.value = activeNote().title;
  renderPreview();
  renderTabs();
  updateWritingStats();
  input.addEventListener('input', () => {
    renderPreview();
    updateWritingStats();
    const note = activeNote();
    if (note) note.updatedAt = Date.now();
    if (note) note.body = input.value;
    renderTabs();
    queueSave();
  });
  input.addEventListener('blur', save);
  titleInput.addEventListener('input', () => {
    const note = activeNote();
    if (!note) return;
    note.title = titleInput.value;
    note.updatedAt = Date.now();
    renderTabs();
    queueSave();
  });
  titleInput.addEventListener('blur', save);
  $('newNoteBtn').addEventListener('click', () => {
    save();
    const note = {id: crypto.randomUUID(), title: 'Untitled note', body: '', updatedAt: Date.now()};
    data.notes.push(note);
    data.sort = 'manual';
    sortInput.value = data.sort;
    openNote(note.id);
    renderTabs();
    input.focus();
  });
  tabs.addEventListener('dblclick', event => {
    const button = event.target.closest('[data-open-note]');
    const note = button && data.notes.find(item => item.id === button.dataset.openNote);
    if (!note) return;
    const name = prompt('Rename note', note.title);
    if (name === null || !name.trim()) return;
    note.title = name.trim().slice(0, 100);
    note.updatedAt = Date.now();
    titleInput.value = activeNote().title;
    renderTabs(); save();
  });
  $('downloadNote').addEventListener('click', () => {
    const blob = new Blob([input.value], {type: 'text/markdown;charset=utf-8'});
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url;
    link.download = displayTitle(activeNote()).replace(/[\\/:*?"<>|]/g, '-') + '.md';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  preview.addEventListener('change', event => {
    const checkbox = event.target.closest('[data-task-line]');
    if (!checkbox) return;
    const lines = input.value.split('\n'), index = Number(checkbox.dataset.taskLine);
    lines[index] = lines[index].replace(/^(\s*[-*+]\s+)\[[ xX]\]/, `$1[${checkbox.checked ? 'x' : ' '}]`);
    input.value = lines.join('\n');
    input.dispatchEvent(new Event('input', {bubbles: true}));
  });
  ['click', 'keyup', 'select'].forEach(name => input.addEventListener(name, updateWritingStats));
  sortInput.addEventListener('change', () => {
    data.sort = sortInput.value;
    renderTabs();
    save();
  });
  tabs.addEventListener('click', event => {
    const openButton = event.target.closest('[data-open-note]');
    if (openButton) { openNote(openButton.dataset.openNote); return; }
    const moveButton = event.target.closest('[data-move-note]');
    if (moveButton) { reorderNote(moveButton.dataset.noteId, moveButton.dataset.moveNote === 'up' ? -1 : 1); return; }
    const deleteButton = event.target.closest('[data-delete-note]');
    if (deleteButton && data.notes.length > 1 && confirm('Delete this note? This cannot be undone.')) {
      const index = data.notes.findIndex(note => note.id === deleteButton.dataset.deleteNote);
      data.notes.splice(index, 1);
      if (data.activeId === deleteButton.dataset.deleteNote) {
        data.activeId = data.notes[Math.max(0, index - 1)].id;
        openNote(data.activeId);
      } else { renderTabs(); save(); }
    }
  });
  tabs.addEventListener('dragstart', event => {
    const tab = event.target.closest('.note-tab');
    if (!tab || data.sort !== 'manual') return;
    draggedId = tab.dataset.noteId;
    tab.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', draggedId);
  });
  tabs.addEventListener('dragover', event => {
    const tab = event.target.closest('.note-tab');
    if (!tab || !draggedId || tab.dataset.noteId === draggedId) return;
    event.preventDefault();
    tabs.querySelectorAll('.drag-over').forEach(item => item.classList.remove('drag-over'));
    tab.classList.add('drag-over');
  });
  tabs.addEventListener('drop', event => {
    const tab = event.target.closest('.note-tab');
    if (!tab || !draggedId || tab.dataset.noteId === draggedId) return;
    event.preventDefault();
    const from = data.notes.findIndex(note => note.id === draggedId);
    const to = data.notes.findIndex(note => note.id === tab.dataset.noteId);
    const [note] = data.notes.splice(from, 1);
    data.notes.splice(to, 0, note);
    draggedId = null;
    renderTabs();
    save();
  });
  tabs.addEventListener('dragend', () => {
    draggedId = null;
    tabs.querySelectorAll('.dragging, .drag-over').forEach(item => item.classList.remove('dragging', 'drag-over'));
  });
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    shell.dataset.view = button.dataset.view;
    document.querySelectorAll('[data-view]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    if (button.dataset.view !== 'preview') input.focus();
  }));

  const MD_FORMATS = {
    bold: { wrap: ['**', '**'], ph: 'bold text' },
    italic: { wrap: ['*', '*'], ph: 'italic text' },
    strike: { wrap: ['~~', '~~'], ph: 'strikethrough' },
    code: { wrap: ['`', '`'], ph: 'code' },
    link: { wrap: ['[', '](https://)'], ph: 'link text' },
    codeblock: { wrap: ['```\n', '\n```'], ph: 'code' },
    heading: { prefix: '## ', ph: 'Heading' },
    quote: { prefix: '> ', ph: 'Quote' },
    ul: { prefix: '- ', ph: 'List item' },
    ol: { prefix: '1. ', ph: 'List item' },
    task: { prefix: '- [ ] ', ph: 'Task' },
    table: { wrap: ['\n', '\n'], ph: '| Column | Column |\n| --- | --- |\n| Text | Text |' },
    divider: { wrap: ['\n', '\n'], ph: '---' },
  };

  document.querySelector('.md-toolbar').insertAdjacentHTML('beforeend', '<span class="md-toolbar-separator" aria-hidden="true"></span><button type="button" data-md="task" title="Task checklist">☑</button><button type="button" data-md="table" title="Insert table">▦</button><button type="button" data-md="divider" title="Horizontal divider">―</button>');

  function applyMdFormat(kind) {
    const format = MD_FORMATS[kind];
    if (!format) return;
    let start = input.selectionStart, end = input.selectionEnd;
    if (format.prefix) {
      start = input.value.lastIndexOf('\n', start - 1) + 1;
      const nextLine = input.value.indexOf('\n', end);
      end = nextLine < 0 ? input.value.length : nextLine;
    }
    const selected = input.value.slice(start, end);
    let text, selA, selB;
    if (format.prefix) {
      text = (selected || format.ph).split('\n').map(line => format.prefix + line).join('\n');
      selA = start; selB = start + text.length;
    } else {
      const inner = selected || format.ph;
      text = format.wrap[0] + inner + format.wrap[1];
      selA = start + format.wrap[0].length; selB = selA + inner.length;
    }
    input.focus();
    input.setSelectionRange(start, end);
    let applied = false;
    try { applied = document.execCommand('insertText', false, text); } catch {}
    if (!applied) {
      input.setRangeText(text, start, end, 'end');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    input.setSelectionRange(selA, selB);
  }

  document.querySelectorAll('[data-md]').forEach(button => {
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', () => applyMdFormat(button.dataset.md));
  });

  input.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      if (event.key.toLowerCase() === 's') { event.preventDefault(); save(); return; }
      const kind = { b: 'bold', i: 'italic', k: 'link' }[event.key.toLowerCase()];
      if (kind) { event.preventDefault(); applyMdFormat(kind); }
    }
    if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      input.setRangeText('  ', input.selectionStart, input.selectionEnd, 'end');
      input.dispatchEvent(new Event('input', {bubbles: true}));
    }
    if (event.key === 'Enter' && !event.shiftKey && input.selectionStart === input.selectionEnd) {
      const caret = input.selectionStart, start = input.value.lastIndexOf('\n', caret - 1) + 1;
      const line = input.value.slice(start, caret);
      const match = line.match(/^(\s*)([-*+] |\d+\. |> )(\[[ xX]\] )?(.*)$/);
      const fenced = input.value.slice(0, caret).split('\n').filter(value => /^\s*```/.test(value)).length % 2;
      if (match && !fenced) {
        event.preventDefault();
        if (!match[4].trim()) input.setRangeText('\n', start, caret, 'end');
        else {
          const marker = /^\d/.test(match[2]) ? `${parseInt(match[2], 10) + 1}. ` : match[2];
          input.setRangeText('\n' + match[1] + marker + (match[3] ? '[ ] ' : ''), caret, caret, 'end');
        }
        input.dispatchEvent(new Event('input', {bubbles: true}));
      }
    }
  });
});
