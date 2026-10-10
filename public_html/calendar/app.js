const $ = id => document.getElementById(id);
const KEY = 'kanban_boards_v1';
const colors = ['#39e6ad', '#7da5ee', '#d5a66b', '#b69ce0', '#e9918c', '#6bc6ce'];
const tehran = () => {
  const parts = new Intl.DateTimeFormat('en-GB', {timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).formatToParts(new Date());
  const p = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`};
};
const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && dateKey(date) === value ? date : null;
}
let currentTime = tehran();
let today = currentTime.date;
let month = new Date(parseDate(today).getFullYear(), parseDate(today).getMonth(), 1);
let selectedDay = today;
let boards = [];
let events = [];
let undated = 0;
let view = matchMedia('(max-width: 800px)').matches ? 'schedule' : 'month';
let overdueOnly = false;
let dayOnly = false;
let query = '';
let refreshing = false;
let lastStorageRaw = null;
let financialEvents = [];
let financialPlans = false;
let financialError = '';
let refreshToken = 0;
const financeBoardId = '__financial_commitments__';
const enabledBoards = new Map();

function boardColor(id) {
  let hash = 0;
  for (const char of String(id)) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return colors[(hash >>> 0) % colors.length];
}
function readBoards(raw) {
  const saved = raw ? JSON.parse(raw) : {};
  boards = Array.isArray(saved.boards) ? saved.boards : [];
  events = []; undated = 0;
  for (const board of boards) {
    if (!enabledBoards.has(board.id)) enabledBoards.set(board.id, true);
    for (const column of board.columns || []) {
      for (const card of column.cards || []) {
        if (!parseDate(card.dueDate)) { undated++; continue; }
        const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(card.dueTime || '') ? card.dueTime : '';
        events.push({id: card.id, boardId: board.id, boardName: board.name, columnName: column.name, title: card.title || 'Untitled card', date: card.dueDate, time, completed: !!card.completed || /^(done|complete|completed)$/i.test(column.name.trim()), color: boardColor(board.id)});
      }
    }
  }
  if (financialPlans) {
    boards.push({id:financeBoardId,name:'Financial commitments'});
    if(!enabledBoards.has(financeBoardId))enabledBoards.set(financeBoardId,true);
  }
  events.push(...financialEvents);
  events.sort((a, b) => (a.date + (a.time || '00:00')).localeCompare(b.date + (b.time || '00:00')) || a.title.localeCompare(b.title));
}
function isOverdue(event) {
  const now = currentTime;
  return !event.completed && (event.date < now.date || (event.date === now.date && event.time && event.time < now.time));
}
function visibleEvents() {
  return events.filter(event => enabledBoards.get(event.boardId) && ($('includeCompleted').checked || !event.completed) && (!query || `${event.title} ${event.boardName} ${event.columnName}`.toLocaleLowerCase().includes(query)));
}
function openCard(event) {
  if(event.source==='finance'){
    if(window.parent!==window)window.parent.postMessage({type:'calendar-open-payment',occurrenceId:event.id,dueDate:event.date},location.origin);
    else location.href=`../finance/index.html?payment=${encodeURIComponent(event.id)}&due=${encodeURIComponent(event.date)}`;
    return;
  }
  if (window.parent !== window) window.parent.postMessage({type: 'calendar-open-card', boardId: event.boardId, cardId: event.id}, location.origin);
  else location.href = `../kanban/index.html?board=${encodeURIComponent(event.boardId)}&card=${encodeURIComponent(event.id)}`;
}
function taskButton(event, kind) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `${kind} ${event.completed ? 'completed' : ''} ${isOverdue(event) ? 'overdue' : ''}`;
  button.style.setProperty('--board-color', event.color);
  button.title = `${event.title} · ${event.boardName} / ${event.columnName} · ${event.date} ${event.time || 'All day'}`;
  button.setAttribute('aria-label', `Open ${button.title}`);
  if (kind === 'calendar-event') {
    if (event.time) { const time = document.createElement('span'); time.className = 'event-time'; time.textContent = event.time; button.append(time); }
    const title = document.createElement('span'); title.className = 'event-title'; title.textContent = event.title; button.append(title);
  } else {
    const leading = document.createElement(kind === 'day-task' ? 'span' : 'time');
    if (kind === 'day-task') leading.className = 'board-dot';
    else { leading.textContent = event.time || 'All day'; leading.dateTime = event.date + (event.time ? `T${event.time}+03:30` : ''); }
    const info = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = event.title;
    const board = document.createElement('small'); board.textContent = `${event.boardName} · ${kind === 'day-task' ? (event.time || 'All day') : event.columnName}`;
    info.append(title, board); button.append(leading, info);
    if (kind === 'schedule-task') { const status = document.createElement('span'); status.className = 'task-status'; status.textContent = event.completed ? 'Completed' : isOverdue(event) ? 'Overdue' : 'Due'; button.append(status); }
  }
  button.addEventListener('click', () => openCard(event));
  return button;
}
function selectDay(date, showSchedule = false) {
  const previousMonth=month.getFullYear()+'-'+month.getMonth();
  selectedDay = dateKey(date);
  month = new Date(date.getFullYear(), date.getMonth(), 1);
  if (showSchedule) { view = 'schedule'; dayOnly = true; overdueOnly = false; }
  render();
  if(previousMonth!==month.getFullYear()+'-'+month.getMonth())refresh();
}
function renderBoardFilters() {
  const focusedBoard = document.activeElement?.dataset.boardId;
  const container = $('boardFilters'); container.replaceChildren();
  boards.forEach(board => {
    const label = document.createElement('label'); label.className = 'board-filter'; label.style.setProperty('--board-color', boardColor(board.id));
    const check = document.createElement('input'); check.type = 'checkbox'; check.checked = enabledBoards.get(board.id);
    check.dataset.boardId = board.id;
    const text = document.createElement('span'); text.textContent = board.name;
    check.addEventListener('change', () => { enabledBoards.set(board.id, check.checked); render(); });
    label.append(check, text); container.append(label);
    if (focusedBoard === String(board.id)) check.focus();
  });
  if (!boards.length) container.textContent = 'Your Kanban boards will appear here.';
}
function renderDays(filtered) {
  const grid = $('monthGrid'); const mini = $('miniDays'); grid.replaceChildren(); mini.replaceChildren();
  const byDate = new Map();
  filtered.forEach(event => { if (!byDate.has(event.date)) byDate.set(event.date, []); byDate.get(event.date).push(event); });
  const first = new Date(month.getFullYear(), month.getMonth(), 1 - month.getDay());
  for (let index = 0; index < 42; index++) {
    const date = new Date(first.getFullYear(), first.getMonth(), first.getDate() + index);
    const key = dateKey(date); const outside = date.getMonth() !== month.getMonth();
    const label = date.toLocaleDateString('en-US', {weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'});
    const miniButton = document.createElement('button'); miniButton.type = 'button'; miniButton.textContent = date.getDate(); miniButton.className = `${outside ? 'outside' : ''} ${key === today ? 'today' : ''} ${key === selectedDay ? 'selected' : ''}`; miniButton.setAttribute('aria-label', label); miniButton.setAttribute('aria-pressed', String(key === selectedDay)); miniButton.addEventListener('click', () => selectDay(date)); mini.append(miniButton);
    const cell = document.createElement('div'); cell.className = `month-cell ${outside ? 'outside' : ''} ${key === selectedDay ? 'selected' : ''}`;
    const number = document.createElement('button'); number.type = 'button'; number.className = `day-number ${key === today ? 'today' : ''}`; number.textContent = date.getDate(); number.setAttribute('aria-label', `Show tasks for ${label}`); if (key === today) number.setAttribute('aria-current', 'date'); number.addEventListener('click', () => selectDay(date, true)); cell.append(number);
    const dayEvents = byDate.get(key) || [];
    dayEvents.slice(0, 3).forEach(event => cell.append(taskButton(event, 'calendar-event')));
    if (dayEvents.length > 3) { const more = document.createElement('button'); more.className = 'more-events'; more.textContent = `+${dayEvents.length - 3} more`; more.setAttribute('aria-label', `Show all ${dayEvents.length} tasks for ${label}`); more.addEventListener('click', () => selectDay(date, true)); cell.append(more); }
    grid.append(cell);
  }
}
function emptyState(title, text) {
  const empty = document.createElement('div'); empty.className = 'calendar-empty';
  empty.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 11h18M8 15h2M14 15h2"/></svg>';
  const heading = document.createElement('strong'); heading.textContent = title;
  const description = document.createElement('p'); description.textContent = text; empty.append(heading, description); return empty;
}
function renderSchedule(filtered) {
  const container = $('scheduleView'); container.replaceChildren();
  const list = filtered.filter(event => overdueOnly ? isOverdue(event) : dayOnly ? event.date === selectedDay : true);
  const grouped = new Map(); list.forEach(event => { if (!grouped.has(event.date)) grouped.set(event.date, []); grouped.get(event.date).push(event); });
  grouped.forEach((tasks, key) => {
    const group = document.createElement('section'); group.className = 'schedule-day';
    const date = parseDate(key); const heading = document.createElement('div'); heading.className = 'schedule-date';
    const number = document.createElement('strong'); number.textContent = date.getDate();
    const labels = document.createElement('div'); const weekday = document.createElement('span'); weekday.textContent = date.toLocaleDateString('en-US', {weekday: 'short'}).toUpperCase(); const monthLabel = document.createElement('span'); monthLabel.textContent = date.toLocaleDateString('en-US', {month: 'short', year: 'numeric'}); labels.append(weekday, monthLabel); heading.append(number, labels);
    const cards = document.createElement('div'); tasks.forEach(event => cards.append(taskButton(event, 'schedule-task'))); group.append(heading, cards); container.append(group);
  });
  if (!list.length) container.append(emptyState(overdueOnly ? 'All caught up' : query ? 'No matching items' : 'A little room to breathe', overdueOnly ? 'No overdue items in the selected calendars.' : query ? 'Try another title, board name, or list name.' : 'No items are due here. Add a Kanban due date or a Finance payment plan.'));
}
function render() {
  currentTime = tehran(); today = currentTime.date;
  const filtered = visibleEvents();
  const monthName = month.toLocaleDateString('en-US', {month: 'long', year: 'numeric'});
  $('monthTitle').textContent = overdueOnly ? 'Overdue items' : query ? 'Search results' : dayOnly ? parseDate(selectedDay).toLocaleDateString('en-US', {month: 'long', day: 'numeric'}) : view === 'schedule' ? 'Schedule' : monthName;
  $('miniMonthTitle').textContent = monthName;
  $('viewSelect').value = view;
  const schedule = view === 'schedule' || !!query || overdueOnly || dayOnly;
  $('monthView').hidden = schedule; $('scheduleView').hidden = !schedule;
  $('overdueCount').textContent = filtered.filter(isOverdue).length;
  $('overdueBtn').setAttribute('aria-pressed', String(overdueOnly));
  renderBoardFilters(); renderDays(filtered); renderSchedule(filtered);
  $('selectedDayTitle').textContent = parseDate(selectedDay).toLocaleDateString('en-US', {month: 'short', day: 'numeric', weekday: 'short'});
  const dayTasks = filtered.filter(event => event.date === selectedDay);
  $('selectedDayCount').textContent = dayTasks.length;
  $('dayTasks').replaceChildren(...dayTasks.map(event => taskButton(event, 'day-task')));
  if (!dayTasks.length) { const empty = document.createElement('p'); empty.className = 'day-empty'; empty.textContent = 'No tasks or financial dues on this day.'; $('dayTasks').append(empty); }
  $('calendarNote').textContent = `${events.length} dated items, including ${financialEvents.length} financial dues in the loaded range and earlier unpaid dues.${undated ? ` ${undated} cards have no due date.` : ''} ${financialError}`;
  const inMonth = filtered.filter(event => event.date.startsWith(dateKey(month).slice(0, 7))).length;
  $('calendarStatus').textContent = financialError || (!schedule && !inMonth ? 'No items due this month. Choose another month or add a Kanban date or Finance payment plan.' : '');
}
async function refresh() {
  const token=++refreshToken;
  refreshing = true; $('refreshBtn').disabled = true;
  try {
    const first=new Date(month.getFullYear(),month.getMonth(),1-month.getDay());
    const last=new Date(first.getFullYear(),first.getMonth(),first.getDate()+41);
    const [boardResult,financeResult]=await Promise.allSettled([
      fetch('/state.php', {headers: {Accept: 'application/json'}, cache: 'no-store', redirect: 'error'}),
      fetch(`/finance-obligations.php?start=${dateKey(first)}&end=${dateKey(last)}`,{cache:'no-store',redirect:'error'})
    ]);
    if(token!==refreshToken)return;
    if(boardResult.status==='rejected')throw Error('Unable to load board tasks.');
    const response=boardResult.value;
    if (!response.ok) throw new Error('Unable to load board tasks. Refresh or sign in again.');
    try{
      if(financeResult.status==='rejected'||!financeResult.value.ok)throw Error('Financial dues unavailable. Refresh to retry.');
      const finance=(await financeResult.value.json()).data;
      if(token!==refreshToken)return;
      financialPlans=finance.plans.length>0;
      // Credits (money owed to you) read as "Receive" and use green; debts read as "Pay".
      financialEvents=finance.occurrences.filter(o=>!o.skipped).map(o=>{const credit=o.direction==='credit';return {id:o.id,source:'finance',boardId:financeBoardId,boardName:'Finance',columnName:o.paymentIssue?'Needs reconciliation':o.status==='rejected'?(credit?'Late':'Deferred'):o.status==='paid'?(credit?'Received':'Paid'):(credit?'To receive':'To pay'),title:`${credit?'Receive':'Pay'} · ${o.title}${o.count>1?' · '+(o.index+1)+'/'+o.count:''} · ${new Intl.NumberFormat('en-US').format(o.amount)} ${window.lifeOsCurrency?.unit()??'Toman'}`,date:o.date,time:'',completed:o.status==='paid',color:credit?'#39e6ad':'#f3c969'};});
      financialError='';
    }catch(error){if(token!==refreshToken)return;financialEvents=[];financialPlans=false;financialError=error.message;}
    const payload = await response.json();if(token!==refreshToken)return;lastStorageRaw = appStorage.getItem(KEY); readBoards(payload.data[KEY]); render();
  } catch (error) { $('calendarStatus').textContent = error.message; }
  finally {if(token===refreshToken){refreshing = false; $('refreshBtn').disabled = false;}}
}
$('todayBtn').addEventListener('click', () => { overdueOnly = false; dayOnly = false; query = ''; $('searchInput').value = ''; selectDay(parseDate(tehran().date)); });
for (const [id, offset] of [['prevBtn', -1], ['nextBtn', 1]]) $(id).addEventListener('click', () => { month = new Date(month.getFullYear(), month.getMonth() + offset, 1); selectedDay = dateKey(month); overdueOnly = false; dayOnly = false; view = 'month'; render(); refresh(); });
$('viewSelect').addEventListener('change', () => { view = $('viewSelect').value; overdueOnly = false; dayOnly = false; render(); });
$('includeCompleted').addEventListener('change', render);
$('allBoardsBtn').addEventListener('click', () => { boards.forEach(board => enabledBoards.set(board.id, true)); render(); });
$('overdueBtn').addEventListener('click', () => { overdueOnly = !overdueOnly; dayOnly = false; query = ''; $('searchInput').value = ''; view = overdueOnly ? 'schedule' : 'month'; render(); });
$('searchInput').addEventListener('input', () => { query = $('searchInput').value.trim().toLocaleLowerCase(); overdueOnly = false; dayOnly = false; if (query) view = 'schedule'; render(); });
$('refreshBtn').addEventListener('click', refresh);
let financialRefreshTimer;
addEventListener('app-storage-change', () => { try { const raw = appStorage.getItem(KEY); if (raw !== lastStorageRaw) { lastStorageRaw = raw; readBoards(raw); render(); } clearTimeout(financialRefreshTimer);financialRefreshTimer=setTimeout(refresh,250); } catch { $('calendarStatus').textContent = 'Unable to read board tasks. Try refreshing.'; } });
addEventListener('message', e => { if (e.origin === location.origin && e.source === window.parent && e.data?.type === 'calendar-refresh') refresh(); });
addEventListener('focus', refresh);
setInterval(() => { if (document.visibilityState === 'visible') render(); }, 60000);
try {
  await window.appStorageReady;
  document.documentElement.dataset.theme = appStorage.getItem('edi_os_theme') || 'dark';
  lastStorageRaw = appStorage.getItem(KEY); readBoards(lastStorageRaw); render(); await refresh();
} catch { $('calendarStatus').textContent = 'Unable to load board tasks. Check your connection and refresh.'; }
