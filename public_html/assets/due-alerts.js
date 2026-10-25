// Due-date alerts for Kanban cards, finance payments and goal deadlines.
// In-app: a bell with a badge and grouped list, plus an Overview banner.
// Browser notifications fire at the due time (and a card's own earlier reminder)
// while LifeOS is open. Already-shown alerts are remembered per device, so the
// shared Kanban document is never written from here.

const DAY = 86400000;
const ICONS = {
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  kanban: '<rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="10" rx="1"/>',
  finance: '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  goals: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DONE_COLUMN = /^(done|complete|completed)$/i;
// Date-only items (goals, payments) alert at the same default time Kanban uses.
const DEFAULT_TIME = '09:00';
// An alert older than this is listed in the panel but never pops up, so turning
// notifications on does not replay old overdue items.
export const NOTIFY_WINDOW = 6 * 3600000;

/** Today's YYYY-MM-DD in Tehran, the app-wide calendar day. */
export function tehranDay(now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
}
export function addDays(day, delta) {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + delta));
  return date.toISOString().slice(0, 10);
}
// Local wall-clock time, matching Kanban's own reminder check.
const dueAtOf = (date, time) => new Date(`${date}T${TIME.test(time || '') ? time : DEFAULT_TIME}`).getTime();

/**
 * Normalize every source into one list of open, dated items.
 * `goalDone(goal)` reports whether a goal is complete (progress is computed elsewhere).
 */
export function collectDueItems({ boards = [], goals = [], payments = [], goalDone = () => false, currency = '' } = {}) {
  const items = [];
  for (const board of Array.isArray(boards) ? boards : []) {
    for (const column of Array.isArray(board?.columns) ? board.columns : []) {
      const columnDone = DONE_COLUMN.test(String(column?.name || '').trim());
      for (const card of Array.isArray(column?.cards) ? column.cards : []) {
        if (!card || card.completed || columnDone || !DATE.test(card.dueDate || '')) continue;
        const reminder = Number(card.reminder);
        items.push({
          key: `card:${board.id}:${card.id}`, source: 'kanban', title: card.title || 'Untitled card',
          context: [board.name, column.name].filter(Boolean).join(' · '),
          date: card.dueDate, time: TIME.test(card.dueTime || '') ? card.dueTime : '', timed: true,
          dueAt: dueAtOf(card.dueDate, card.dueTime),
          reminderMinutes: [5, 60, 1440].includes(reminder) ? reminder : 0,
          open: { page: 'kanban', boardId: String(board.id), cardId: String(card.id) },
        });
      }
    }
  }
  for (const goal of Array.isArray(goals) ? goals : []) {
    if (!goal || goal.status === 'archived' || !DATE.test(goal.deadline || '') || goalDone(goal)) continue;
    items.push({
      key: `goal:${goal.id}`, source: 'goals', title: goal.title || 'Untitled goal', context: 'Goal deadline',
      date: goal.deadline, time: '', timed: false, dueAt: dueAtOf(goal.deadline), reminderMinutes: 0,
      open: { page: 'goals', goalId: String(goal.id) },
    });
  }
  for (const payment of Array.isArray(payments) ? payments : []) {
    if (!payment || payment.skipped || payment.status === 'paid' || !DATE.test(payment.date || '')) continue;
    const credit = payment.direction === 'credit';
    const amount = Number(payment.amount);
    items.push({
      key: `payment:${payment.id}`, source: 'finance', title: `${credit ? 'Receive' : 'Pay'} · ${payment.title || 'Payment'}`,
      context: Number.isFinite(amount) ? `${new Intl.NumberFormat('en-US').format(amount)}${currency ? ` ${currency}` : ''}` : 'Finance',
      date: payment.date, time: '', timed: false, dueAt: dueAtOf(payment.date), reminderMinutes: 0,
      open: { page: 'finance', occurrenceId: String(payment.id), dueDate: payment.date },
    });
  }
  return items;
}

/** Group items into overdue, today and coming up (next 24 h for cards, 3 days otherwise). */
export function classify(items, now = Date.now()) {
  const today = tehranDay(now);
  const soonLimit = addDays(today, 3);
  const groups = { overdue: [], today: [], soon: [] };
  for (const item of items) {
    const overdue = item.timed ? item.dueAt < now : item.date < today;
    if (overdue) groups.overdue.push(item);
    else if (item.date === today) groups.today.push(item);
    else if (item.timed ? item.dueAt - now <= DAY : item.date <= soonLimit) groups.soon.push(item);
  }
  for (const list of Object.values(groups)) list.sort((a, b) => a.dueAt - b.dueAt || a.title.localeCompare(b.title));
  return groups;
}

/**
 * Notifications that are due now and not yet shown on this device. Timed items
 * notify within NOTIFY_WINDOW of their time; date-only items any time on their
 * due day, so opening LifeOS in the afternoon still reports today's payment.
 */
export function pendingNotifications(items, now, shown) {
  const pending = [];
  const today = tehranDay(now);
  for (const item of items) {
    const stages = [{ stage: 'due', at: item.dueAt }];
    if (item.reminderMinutes) stages.push({ stage: `before-${item.reminderMinutes}`, at: item.dueAt - item.reminderMinutes * 60000 });
    for (const { stage, at } of stages) {
      // The date is part of the key, so a rescheduled or recurring item alerts again.
      const key = `${item.key}|${item.date}|${item.time}|${stage}`;
      const current = item.timed || stage !== 'due' ? now - at <= NOTIFY_WINDOW : item.date === today;
      if (now >= at && current && !shown[key]) pending.push({ key, item, stage });
    }
  }
  return pending;
}

// ── Browser side ─────────────────────────────────────────────────
const NOTIFY_PREF = 'lifeos-due-notifications';
const SHOWN = 'lifeos-due-notified';
const readLocal = (name, fallback) => { try { return JSON.parse(localStorage.getItem(name)) ?? fallback; } catch { return fallback; } };
const writeLocal = (name, value) => { try { localStorage.setItem(name, JSON.stringify(value)); } catch { /* Storage may be unavailable. */ } };
export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;
export const notificationsEnabled = () => notificationsSupported() && Notification.permission === 'granted' && readLocal(NOTIFY_PREF, false) === true;

/** Ask for permission and remember the choice for this device. */
export async function enableNotifications() {
  if (!notificationsSupported()) throw new Error('This browser does not support notifications.');
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked. Allow them for this site in your browser settings.');
  writeLocal(NOTIFY_PREF, true);
}
export function disableNotifications() { writeLocal(NOTIFY_PREF, false); }

function whenText(item, now) {
  const today = tehranDay(now);
  const day = item.date === today ? 'Today' : item.date === addDays(today, 1) ? 'Tomorrow' : item.date === addDays(today, -1) ? 'Yesterday'
    : new Date(`${item.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return item.time ? `${day} · ${item.time}` : day;
}

export function mountDueAlerts({ esc, openItem }) {
  const $ = id => document.getElementById(id);
  let payments = [];
  let paymentsError = false;
  let notifyError = '';
  let items = [];
  const goalDone = goal => window.LifeGoalProgress?.result(goal, null)?.pct === 100;
  const readDoc = key => { try { return JSON.parse(appStorage.getItem(key) || 'null') || {}; } catch { return {}; } };

  const bell = document.createElement('button');
  bell.type = 'button'; bell.className = 'due-bell'; bell.id = 'dueBell';
  bell.setAttribute('aria-haspopup', 'dialog'); bell.setAttribute('aria-expanded', 'false'); bell.setAttribute('aria-controls', 'duePanel');
  bell.innerHTML = `${icon('bell')}<span class="due-bell-count" hidden></span>`;
  const panel = document.createElement('section');
  panel.className = 'due-panel'; panel.id = 'duePanel'; panel.hidden = true;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Due and overdue items');
  $('theme').before(bell);
  document.body.append(panel);

  const banner = document.createElement('button');
  banner.type = 'button'; banner.className = 'due-banner'; banner.hidden = true;
  document.querySelector('#dashboard .dash-topbar')?.after(banner);

  function row(item, now) {
    return `<li><button type="button" class="due-item due-${item.source}" data-due-key="${esc(item.key)}">
      <span class="due-item-icon">${icon(item.source)}</span>
      <span class="due-item-text"><strong dir="auto">${esc(item.title)}</strong><small>${esc(item.context)}</small></span>
      <span class="due-item-when">${esc(whenText(item, now))}</span></button></li>`;
  }

  function render() {
    const now = Date.now();
    const groups = classify(items, now);
    const urgent = groups.overdue.length + groups.today.length;
    const count = bell.querySelector('.due-bell-count');
    count.hidden = !urgent; count.textContent = urgent > 99 ? '99+' : String(urgent);
    bell.classList.toggle('has-overdue', groups.overdue.length > 0);
    const label = urgent ? `${groups.overdue.length} overdue and ${groups.today.length} due today` : 'Nothing due today';
    bell.title = label; bell.setAttribute('aria-label', `Due items: ${label}`);

    banner.hidden = !urgent;
    if (urgent) {
      const parts = [groups.overdue.length && `${groups.overdue.length} overdue`, groups.today.length && `${groups.today.length} due today`].filter(Boolean);
      banner.className = `due-banner${groups.overdue.length ? ' is-overdue' : ''}`;
      banner.innerHTML = `${icon('bell')}<span><strong>${esc(parts.join(' · '))}</strong> across your tasks, goals and payments</span><span class="due-banner-action">Review</span>`;
    }

    const section = (title, list, kind) => list.length
      ? `<section class="due-group due-group-${kind}"><h3>${title}<span>${list.length}</span></h3><ul>${list.map(item => row(item, now)).join('')}</ul></section>` : '';
    const body = section('Overdue', groups.overdue, 'overdue') + section('Today', groups.today, 'today') + section('Coming up', groups.soon, 'soon');
    const notify = !notificationsSupported() ? '<p class="due-notify-note">This browser does not support notifications.</p>'
      : notificationsEnabled()
        ? '<div class="due-notify"><span>Browser notifications are on for this device.</span><button type="button" data-due-notify="off">Turn off</button></div>'
        : `<div class="due-notify"><span>${Notification.permission === 'denied' ? 'Notifications are blocked for this site in your browser settings.' : 'Get a notification when something is due.'}</span>${Notification.permission === 'denied' ? '' : '<button type="button" data-due-notify="on">Turn on</button>'}</div>`;
    panel.innerHTML = `<header><div><h2>Due &amp; overdue</h2><p>${esc(label)}</p></div><button type="button" class="due-close" aria-label="Close">×</button></header>
      <div class="due-body">${body || `<div class="due-empty">${icon('bell')}<strong>You're all caught up</strong><span>Nothing is overdue or due soon.</span></div>`}
      ${paymentsError ? '<p class="due-error">Finance payments could not be checked. They will be retried shortly.</p>' : ''}</div>
      <footer>${notify}${notifyError ? `<p class="due-error" role="alert">${esc(notifyError)}</p>` : ''}</footer>`;
  }

  function notify() {
    if (!notificationsEnabled()) return;
    const now = Date.now();
    const shown = readLocal(SHOWN, {});
    for (const [key, at] of Object.entries(shown)) if (now - at > 14 * DAY) delete shown[key];
    for (const { key, item, stage } of pendingNotifications(items, now, shown)) {
      shown[key] = now;
      const lead = stage === 'due' ? (item.timed ? 'Due now' : 'Due today') : `Due ${whenText(item, now)}`;
      try {
        const note = new Notification(`${lead}: ${item.title}`, { body: item.context, tag: key });
        note.onclick = () => { window.focus(); openItem(item.open); note.close(); };
      } catch { /* Some browsers only allow notifications from a service worker. */ }
    }
    writeLocal(SHOWN, shown);
  }

  function refresh() {
    items = collectDueItems({
      boards: readDoc('kanban_boards_v1').boards, goals: readDoc('edi_goals_v1').goals,
      payments, goalDone, currency: window.lifeOsCurrency?.unit() || '',
    });
    render();
    notify();
  }

  async function loadPayments() {
    const today = tehranDay();
    try {
      const response = await fetch(`/finance-obligations.php?start=${today}&end=${addDays(today, 7)}`, { headers: { Accept: 'application/json' }, cache: 'no-store', redirect: 'error' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()).data;
      payments = Array.isArray(data?.occurrences) ? data.occurrences : [];
      paymentsError = false;
    } catch { paymentsError = true; }
    refresh();
  }

  const open = show => {
    panel.hidden = !show; bell.setAttribute('aria-expanded', String(show));
    if (show) { render(); panel.querySelector('.due-close')?.focus(); }
  };
  bell.addEventListener('click', () => open(panel.hidden));
  banner.addEventListener('click', () => open(true));
  panel.addEventListener('click', async event => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.classList.contains('due-close')) { open(false); bell.focus(); return; }
    if (target.dataset.dueNotify === 'on') {
      try { await enableNotifications(); notifyError = ''; } catch (error) { notifyError = error.message; }
      render(); notify(); return;
    }
    if (target.dataset.dueNotify === 'off') { disableNotifications(); notifyError = ''; render(); return; }
    const item = items.find(entry => entry.key === target.dataset.dueKey);
    if (item) { open(false); openItem(item.open); }
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) { open(false); bell.focus(); } });
  const dismissOutside = event => {
    if (!panel.hidden && !panel.contains(event.target) && !bell.contains(event.target) && !banner.contains(event.target)) open(false);
  };
  document.addEventListener('pointerdown', dismissOutside, true);
  document.addEventListener('click', dismissOutside);
  // Events inside an app iframe do not bubble into the shell document.
  const observedDocuments = new WeakSet();
  const observeFrame = frame => {
    try {
      const doc = frame.contentDocument;
      if (!doc || observedDocuments.has(doc)) return;
      observedDocuments.add(doc);
      const dismissFromApp = () => { if (!panel.hidden) open(false); };
      doc.addEventListener('pointerdown', dismissFromApp, true);
      doc.addEventListener('click', dismissFromApp, true);
    } catch { /* Only the app's same-origin frames are observed. */ }
  };
  document.querySelectorAll('iframe').forEach(frame => {
    frame.addEventListener('load', () => observeFrame(frame));
    observeFrame(frame);
  });

  let storageTimer;
  addEventListener('app-storage-change', () => { clearTimeout(storageTimer); storageTimer = setTimeout(refresh, 300); });
  // Payments come from the server; recheck them every five minutes.
  setInterval(loadPayments, 5 * 60000);
  setInterval(refresh, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  refresh();
  loadPayments();
  return { refresh };
}
