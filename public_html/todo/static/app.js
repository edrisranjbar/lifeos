const KEY = 'edi_todos_v1';
const $ = id => document.getElementById(id);
const escapeHtml = globalThis.lifeOsHtml.escapeHtml;

const PRIORITIES = {high: 3, medium: 2, low: 1, none: 0};
const LIST_COLORS = ['#39e6ad', '#7dbafa', '#f3c969', '#ff9ec4', '#b79cff', '#ff8060'];
const ICONS = {
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1Z"/>',
  today: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  upcoming: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 11h18"/>',
  all: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2"/>',
  done: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 11h18"/>',
  subtasks: '<path d="M9 6h11M13 12h7M13 18h7M4 4v10a2 2 0 0 0 2 2h3"/>',
  notes: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
const VIEWS = [
  {id: 'inbox', name: 'Inbox', hint: 'Tasks that are not in a list yet.'},
  {id: 'today', name: 'Today', hint: 'Due today, plus anything overdue.'},
  {id: 'upcoming', name: 'Upcoming', hint: 'Everything with a due date, soonest first.'},
  {id: 'all', name: 'All tasks', hint: 'Every open task across your lists.'},
  {id: 'done', name: 'Completed', hint: 'Finished tasks, most recent first.'}
];

// Due dates are plain calendar days, compared in the viewer's local time.
const dayKey = (date = new Date()) => date.toLocaleDateString('en-CA');
const addDays = (days) => { const date = new Date(); date.setDate(date.getDate() + days); return dayKey(date); };
function dueLabel(due) {
  if (!due) return '';
  const today = dayKey();
  if (due === today) return 'Today';
  if (due === addDays(1)) return 'Tomorrow';
  if (due === addDays(-1)) return 'Yesterday';
  const date = new Date(`${due}T00:00`);
  return date.toLocaleDateString(undefined, {month: 'short', day: 'numeric', ...(date.getFullYear() !== new Date().getFullYear() ? {year: 'numeric'} : {})});
}
const dueState = task => !task.due || task.done ? '' : task.due < dayKey() ? 'overdue' : task.due === dayKey() ? 'today' : '';

function normalize(saved) {
  const data = saved && typeof saved === 'object' ? saved : {};
  const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
  const lists = (Array.isArray(data.lists) ? data.lists : []).filter(list => list && typeof list.id === 'string')
    .map((list, index) => ({id: list.id, name: text(list.name, 60) || 'Untitled list', color: LIST_COLORS.includes(list.color) ? list.color : LIST_COLORS[index % LIST_COLORS.length]}));
  const tasks = (Array.isArray(data.tasks) ? data.tasks : []).filter(task => task && typeof task.id === 'string').map(task => ({
    id: task.id,
    title: text(task.title, 300),
    notes: text(task.notes, 20000),
    due: /^\d{4}-\d{2}-\d{2}$/.test(task.due || '') ? task.due : '',
    priority: task.priority in PRIORITIES ? task.priority : 'none',
    listId: lists.some(list => list.id === task.listId) ? task.listId : null,
    done: task.done === true,
    subtasks: (Array.isArray(task.subtasks) ? task.subtasks : []).filter(sub => sub && typeof sub.id === 'string').map(sub => ({id: sub.id, title: text(sub.title, 300), done: sub.done === true})),
    createdAt: Number(task.createdAt) || Date.now(),
    updatedAt: Number(task.updatedAt) || Date.now(),
    completedAt: Number(task.completedAt) || null
  }));
  const views = [...VIEWS.map(view => view.id), ...lists.map(list => list.id)];
  return {tasks, lists, view: views.includes(data.view) ? data.view : 'inbox', sort: ['smart', 'due', 'priority', 'created', 'title'].includes(data.sort) ? data.sort : 'smart'};
}

document.addEventListener('DOMContentLoaded', async () => {
  await window.appStorageReady;
  const read = () => { try { return normalize(JSON.parse(appStorage.getItem(KEY))); } catch { return normalize(null); } };
  let data = read();
  let selectedId = null;
  let query = '';
  let lastSaved = JSON.stringify(data);

  const status = $('saveStatus');
  const save = () => {
    lastSaved = JSON.stringify(data);
    try {
      appStorage.setItem(KEY, lastSaved);
      status.textContent = 'Saved'; status.dataset.state = 'saved';
    } catch {
      status.textContent = 'Save failed'; status.dataset.state = 'failed';
    }
  };
  // Text fields save while typing, but not on every keystroke.
  let typingTimer;
  const saveSoon = () => { clearTimeout(typingTimer); typingTimer = setTimeout(save, 300); };
  const commit = () => { clearTimeout(typingTimer); save(); render(); };

  let toastTimer;
  function toast(message, action) {
    const box = $('toast');
    box.innerHTML = `<span>${escapeHtml(message)}</span>${action ? '<button type="button">Undo</button>' : ''}`;
    if (action) box.querySelector('button').onclick = () => { action(); box.classList.remove('show'); };
    box.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.classList.remove('show'), action ? 6000 : 2600);
  }

  const findTask = id => data.tasks.find(task => task.id === id);
  const findList = id => data.lists.find(list => list.id === id);
  const matchesQuery = task => !query || `${task.title}\n${task.notes}\n${task.subtasks.map(sub => sub.title).join('\n')}`.toLocaleLowerCase().includes(query);

  function inView(task, view) {
    if (view === 'done') return task.done;
    if (task.done) return false;
    if (view === 'inbox') return !task.listId;
    if (view === 'today') return !!task.due && task.due <= dayKey();
    if (view === 'upcoming') return !!task.due;
    if (view === 'all') return true;
    return task.listId === view;
  }
  // Completed tasks in a list stay visible under that list's "Completed" section.
  const doneInList = view => findList(view) || view === 'inbox' ? data.tasks.filter(task => task.done && (view === 'inbox' ? !task.listId : task.listId === view)) : [];

  function sortTasks(tasks) {
    const byDue = (a, b) => (a.due || '9999').localeCompare(b.due || '9999');
    const byPriority = (a, b) => PRIORITIES[b.priority] - PRIORITIES[a.priority];
    const compare = {
      smart: (a, b) => byDue(a, b) || byPriority(a, b) || a.createdAt - b.createdAt,
      due: (a, b) => byDue(a, b) || a.createdAt - b.createdAt,
      priority: (a, b) => byPriority(a, b) || byDue(a, b),
      created: (a, b) => b.createdAt - a.createdAt,
      title: (a, b) => a.title.localeCompare(b.title, undefined, {sensitivity: 'base'})
    }[data.view === 'upcoming' ? 'due' : data.sort];
    return [...tasks].sort(compare);
  }

  function taskRow(task) {
    const list = findList(task.listId);
    const doneSubs = task.subtasks.filter(sub => sub.done).length;
    const due = dueState(task);
    const chips = [
      task.due ? `<span class="chip ${due}">${icon('calendar')}${escapeHtml(dueLabel(task.due))}</span>` : '',
      task.subtasks.length ? `<span class="chip ${doneSubs === task.subtasks.length ? 'complete' : ''}">${icon('subtasks')}${doneSubs}/${task.subtasks.length}</span>` : '',
      task.priority !== 'none' ? `<span class="chip priority-${task.priority}">${task.priority[0].toUpperCase() + task.priority.slice(1)}</span>` : '',
      list && data.view !== list.id ? `<span class="chip"><i class="list-dot" style="background:${list.color};margin:0"></i>${escapeHtml(list.name)}</span>` : ''
    ].join('');
    return `<li class="task${task.done ? ' done' : ''}${task.id === selectedId ? ' selected' : ''}" data-id="${escapeHtml(task.id)}" data-priority="${task.priority}">
      <label class="check" title="${task.done ? 'Mark as not done' : 'Mark complete'}"><input type="checkbox" data-toggle ${task.done ? 'checked' : ''}><span aria-hidden="true"></span><span class="sr-only">${escapeHtml(task.title)}</span></label>
      <div class="task-body">
        <button type="button" class="sr-only" data-open>Open ${escapeHtml(task.title)}</button>
        <span class="task-title" dir="auto">${escapeHtml(task.title)}</span>
        ${task.notes.trim() ? `<span class="task-desc" dir="auto">${escapeHtml(task.notes.trim().split('\n')[0])}</span>` : ''}
        <div class="task-meta">${chips}</div>
      </div>
    </li>`;
  }

  function renderSidebar() {
    const counts = Object.fromEntries(VIEWS.map(view => [view.id, data.tasks.filter(task => inView(task, view.id)).length]));
    const overdue = data.tasks.filter(task => dueState(task) === 'overdue').length;
    $('viewList').innerHTML = VIEWS.map(view => `<button type="button" class="view-item" data-view="${view.id}" aria-current="${data.view === view.id}">${icon(view.id)}<span class="view-name">${view.name}</span><span class="view-count${view.id === 'today' && overdue ? ' alert' : ''}">${view.id === 'done' ? '' : counts[view.id] || ''}</span></button>`).join('');
    $('customLists').innerHTML = data.lists.map(list => `<button type="button" class="view-item" data-view="${escapeHtml(list.id)}" aria-current="${data.view === list.id}"><i class="list-dot" style="background:${list.color}"></i><span class="view-name" dir="auto">${escapeHtml(list.name)}</span><span class="view-count">${data.tasks.filter(task => !task.done && task.listId === list.id).length || ''}</span></button>`).join('');
  }

  function listHint(list) {
    const open = data.tasks.filter(task => !task.done && task.listId === list.id).length;
    return open ? `${open} open task${open === 1 ? '' : 's'}.` : 'Nothing left to do in this list.';
  }

  function renderTasks() {
    const view = VIEWS.find(item => item.id === data.view);
    const list = findList(data.view);
    $('viewTitle').textContent = view ? view.name : list.name;
    $('viewTitle').dir = 'auto';
    $('viewHint').textContent = query ? `Showing matches for “${query}”.` : view ? view.hint : listHint(list);
    $('listMenuBtn').hidden = $('deleteListBtn').hidden = !list;
    $('quickAdd').hidden = data.view === 'done';
    $('sortSelect').value = data.sort;
    $('sortSelect').hidden = data.view === 'upcoming';

    const open = sortTasks(data.tasks.filter(task => inView(task, data.view) && matchesQuery(task)));
    $('taskList').innerHTML = data.view === 'done'
      ? open.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)).map(taskRow).join('')
      : open.map(taskRow).join('');

    const done = doneInList(data.view).filter(matchesQuery).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    $('doneSection').hidden = !done.length;
    $('doneLabel').textContent = `Completed · ${done.length}`;
    $('doneList').innerHTML = done.map(taskRow).join('');

    const empty = !open.length;
    $('emptyState').hidden = !empty;
    if (empty) {
      $('emptyTitle').textContent = query ? 'No matching tasks' : data.view === 'done' ? 'Nothing completed yet' : data.view === 'today' ? 'Nothing due today' : 'All clear';
      $('emptyText').textContent = query ? 'Try a different search.' : data.view === 'done' ? 'Finished tasks will collect here.' : 'Add a task above to get started.';
    }
    const openTotal = data.tasks.filter(task => !task.done).length;
    $('openCount').textContent = `${openTotal} open`;
  }

  function renderListOptions() {
    $('detailList').innerHTML = `<option value="">Inbox</option>${data.lists.map(list => `<option value="${escapeHtml(list.id)}">${escapeHtml(list.name)}</option>`).join('')}`;
  }

  function renderSubtasks(task) {
    const done = task.subtasks.filter(sub => sub.done).length;
    $('subtaskCount').textContent = task.subtasks.length ? `${done} of ${task.subtasks.length}` : '';
    $('subtaskProgress').hidden = !task.subtasks.length;
    $('subtaskProgress').firstElementChild.style.width = task.subtasks.length ? `${(done / task.subtasks.length) * 100}%` : '0';
    $('subtaskList').innerHTML = task.subtasks.map(sub => `<li class="subtask${sub.done ? ' done' : ''}" data-sub="${escapeHtml(sub.id)}">
      <label class="check small"><input type="checkbox" ${sub.done ? 'checked' : ''}><span aria-hidden="true"></span><span class="sr-only">Done</span></label>
      <input type="text" value="${escapeHtml(sub.title)}" maxlength="300" dir="auto" aria-label="Subtask">
      <button type="button" class="icon-btn" data-remove-sub title="Remove subtask" aria-label="Remove subtask"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
    </li>`).join('');
  }

  const fitTitle = () => { const title = $('detailTitle'); title.style.height = 'auto'; title.style.height = `${title.scrollHeight}px`; };

  function renderDetail() {
    const task = findTask(selectedId);
    $('taskDetail').hidden = !task;
    document.querySelector('.todo-workspace').classList.toggle('has-detail', !!task);
    if (!task) return;
    const active = document.activeElement;
    const keep = element => element === active;
    if (!keep($('detailTitle'))) $('detailTitle').value = task.title;
    $('detailTitle').classList.toggle('done', task.done);
    $('detailDone').checked = task.done;
    if (!keep($('detailDue'))) $('detailDue').value = task.due;
    $('detailPriority').value = task.priority;
    renderListOptions();
    $('detailList').value = task.listId || '';
    if (!keep($('detailNotes'))) $('detailNotes').value = task.notes;
    if (!$('subtaskList').contains(active)) renderSubtasks(task);
    const created = new Date(task.createdAt).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'});
    $('detailMeta').textContent = task.done && task.completedAt ? `Completed ${new Date(task.completedAt).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}` : `Created ${created}`;
    requestAnimationFrame(fitTitle);
  }

  function render() {
    renderSidebar();
    renderTasks();
    renderDetail();
  }

  const touch = task => { task.updatedAt = Date.now(); };
  function setDone(task, done) {
    task.done = done;
    task.completedAt = done ? Date.now() : null;
    touch(task);
    commit();
    if (done) toast('Task completed', () => { task.done = false; task.completedAt = null; commit(); });
  }
  function select(id) {
    selectedId = id;
    render();
  }

  // Sidebar
  for (const container of [$('viewList'), $('customLists')]) container.addEventListener('click', event => {
    const button = event.target.closest('[data-view]');
    if (!button) return;
    data.view = button.dataset.view;
    commit();
  });
  $('newListBtn').onclick = () => { $('newListForm').hidden = false; $('newListName').value = ''; $('newListName').focus(); };
  $('newListForm').onsubmit = event => {
    event.preventDefault();
    const name = $('newListName').value.trim();
    $('newListForm').hidden = true;
    if (!name) return;
    const list = {id: crypto.randomUUID(), name, color: LIST_COLORS[data.lists.length % LIST_COLORS.length]};
    data.lists.push(list);
    data.view = list.id;
    commit();
    $('quickTitle').focus();
  };
  $('newListName').addEventListener('blur', () => { if (!$('newListName').value.trim()) $('newListForm').hidden = true; else $('newListForm').requestSubmit(); });
  $('newListName').addEventListener('keydown', event => { if (event.key === 'Escape') { $('newListName').value = ''; $('newListName').blur(); } });
  $('listMenuBtn').onclick = () => {
    const list = findList(data.view);
    const name = list && prompt('Rename list', list.name)?.trim();
    if (!name) return;
    list.name = name.slice(0, 60);
    commit();
  };
  $('deleteListBtn').onclick = () => {
    const list = findList(data.view);
    if (!list) return;
    const count = data.tasks.filter(task => task.listId === list.id).length;
    if (!confirm(count ? `Delete “${list.name}”? Its ${count} task${count === 1 ? '' : 's'} will move to the Inbox.` : `Delete “${list.name}”?`)) return;
    for (const task of data.tasks) if (task.listId === list.id) task.listId = null;
    data.lists = data.lists.filter(item => item !== list);
    data.view = 'inbox';
    commit();
  };

  // Task list
  $('quickAdd').onsubmit = event => {
    event.preventDefault();
    const title = $('quickTitle').value.trim();
    if (!title) return;
    const due = $('quickDue').value || (data.view === 'today' ? dayKey() : '');
    const now = Date.now();
    data.tasks.push({id: crypto.randomUUID(), title, notes: '', due, priority: $('quickPriority').value, listId: findList(data.view) ? data.view : null, done: false, subtasks: [], createdAt: now, updatedAt: now, completedAt: null});
    $('quickTitle').value = ''; $('quickDue').value = ''; $('quickPriority').value = 'none';
    commit();
  };
  $('sortSelect').onchange = () => { data.sort = $('sortSelect').value; commit(); };
  for (const container of [$('taskList'), $('doneList')]) {
    container.addEventListener('change', event => {
      if (!event.target.matches('[data-toggle]')) return;
      const task = findTask(event.target.closest('.task').dataset.id);
      if (task) setDone(task, event.target.checked);
    });
    container.addEventListener('click', event => {
      const row = event.target.closest('.task');
      if (!row || event.target.closest('.check')) return;
      select(row.dataset.id === selectedId && !event.target.closest('[data-open]') ? null : row.dataset.id);
    });
  }
  $('clearDoneBtn').onclick = event => {
    event.preventDefault();
    const done = doneInList(data.view);
    if (!done.length || !confirm(`Delete ${done.length} completed task${done.length === 1 ? '' : 's'}?`)) return;
    data.tasks = data.tasks.filter(task => !done.includes(task));
    if (done.some(task => task.id === selectedId)) selectedId = null;
    commit();
    toast(`Deleted ${done.length} task${done.length === 1 ? '' : 's'}`, () => {
      // Restore removed records without replacing work saved since the deletion.
      const existingIds = new Set(data.tasks.map(task => task.id));
      for (const task of done) {
        if (existingIds.has(task.id)) continue;
        data.tasks.push(task);
        existingIds.add(task.id);
      }
      commit();
    });
  };

  // Detail panel
  const current = () => findTask(selectedId);
  $('closeDetail').onclick = () => select(null);
  $('detailDone').onchange = () => { const task = current(); if (task) setDone(task, $('detailDone').checked); };
  $('detailTitle').addEventListener('input', () => {
    const task = current(); if (!task) return;
    task.title = $('detailTitle').value.replace(/\n/g, ' ');
    touch(task); fitTitle(); saveSoon();
    const row = document.querySelector(`.task[data-id="${CSS.escape(task.id)}"] .task-title`);
    if (row) row.textContent = task.title;
  });
  $('detailTitle').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); $('detailTitle').blur(); } });
  $('detailTitle').addEventListener('blur', () => {
    const task = current(); if (!task) return;
    task.title = task.title.trim() || 'Untitled task';
    commit();
  });
  $('detailDue').onchange = () => { const task = current(); if (!task) return; task.due = $('detailDue').value; touch(task); commit(); };
  $('detailPriority').onchange = () => { const task = current(); if (!task) return; task.priority = $('detailPriority').value; touch(task); commit(); };
  $('detailList').onchange = () => { const task = current(); if (!task) return; task.listId = $('detailList').value || null; touch(task); commit(); };
  $('detailNotes').addEventListener('input', () => { const task = current(); if (!task) return; task.notes = $('detailNotes').value; touch(task); saveSoon(); });
  $('detailNotes').addEventListener('blur', () => { if (current()) commit(); });
  $('deleteTask').onclick = () => {
    const task = current(); if (!task) return;
    const index = data.tasks.indexOf(task);
    data.tasks.splice(index, 1);
    selectedId = null;
    commit();
    toast('Task deleted', () => { data.tasks.splice(index, 0, task); selectedId = task.id; commit(); });
  };

  // Subtasks
  $('subtaskAdd').onsubmit = event => {
    event.preventDefault();
    const task = current(), title = $('subtaskTitle').value.trim();
    if (!task || !title) return;
    task.subtasks.push({id: crypto.randomUUID(), title, done: false});
    $('subtaskTitle').value = '';
    touch(task);
    renderSubtasks(task);
    commit();
  };
  const subtaskOf = element => { const task = current(), id = element.closest('[data-sub]')?.dataset.sub; return [task, task?.subtasks.find(sub => sub.id === id)]; };
  $('subtaskList').addEventListener('change', event => {
    if (event.target.type !== 'checkbox') return;
    const [task, sub] = subtaskOf(event.target); if (!sub) return;
    sub.done = event.target.checked;
    touch(task);
    renderSubtasks(task);
    commit();
  });
  $('subtaskList').addEventListener('input', event => {
    if (event.target.type !== 'text') return;
    const [task, sub] = subtaskOf(event.target); if (!sub) return;
    sub.title = event.target.value;
    touch(task); saveSoon();
  });
  $('subtaskList').addEventListener('keydown', event => {
    if (event.target.type !== 'text' || event.key !== 'Enter') return;
    event.preventDefault();
    $('subtaskTitle').focus();
  });
  $('subtaskList').addEventListener('focusout', event => {
    if (event.target.type !== 'text') return;
    const [task, sub] = subtaskOf(event.target); if (!sub) return;
    // An emptied subtask is removed rather than kept blank.
    if (sub.title.trim()) { sub.title = sub.title.trim(); save(); return; }
    task.subtasks = task.subtasks.filter(item => item !== sub);
    renderSubtasks(task);
    commit();
  });
  $('subtaskList').addEventListener('click', event => {
    if (!event.target.closest('[data-remove-sub]')) return;
    const [task, sub] = subtaskOf(event.target); if (!sub) return;
    task.subtasks = task.subtasks.filter(item => item !== sub);
    touch(task);
    renderSubtasks(task);
    commit();
  });

  // Search and keyboard shortcuts
  $('searchInput').addEventListener('input', () => { query = $('searchInput').value.trim().toLocaleLowerCase(); renderTasks(); });
  document.addEventListener('keydown', event => {
    const typing = event.target.closest('input, textarea, select, [contenteditable]');
    if (event.key === '/' && !typing) { event.preventDefault(); $('searchInput').focus(); }
    else if (event.key.toLowerCase() === 'n' && !typing && !event.metaKey && !event.ctrlKey) { event.preventDefault(); $('quickTitle').focus(); }
    else if (event.key === 'Escape' && selectedId && !typing) select(null);
    else if (event.key === 'Escape' && event.target === $('searchInput')) { $('searchInput').value = ''; query = ''; renderTasks(); $('searchInput').blur(); }
  });

  // Adopt changes saved from another tab or device.
  addEventListener('app-storage-change', () => {
    const raw = appStorage.getItem(KEY);
    if (!raw || raw === lastSaved) return;
    try { data = normalize(JSON.parse(raw)); } catch { return; }
    lastSaved = raw;
    if (!findTask(selectedId)) selectedId = null;
    render();
  });

  // Keep "Today" and overdue markers right when the page stays open past midnight.
  let renderedDay = dayKey();
  setInterval(() => { if (dayKey() !== renderedDay) { renderedDay = dayKey(); render(); } }, 60000);

  addEventListener('resize', () => { if (selectedId) fitTitle(); });
  render();
});
