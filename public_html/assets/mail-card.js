// Overview cards for the connected mailbox: the daily AI summary and the recent inbox.
// Every string from mail is rendered with textContent, never as HTML.
const REFRESH_MS = 10 * 60 * 1000;
const REFRESH_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/></svg>';

let row, state = {connected: null, loadedAt: 0, autoRequested: false, busy: {summary: false, inbox: false}};

async function mailApi(body, query) {
  const headers = {Accept: 'application/json'};
  if (body) Object.assign(headers, {'Content-Type': 'application/json', 'X-CSRF-Token': await appStorage.csrfToken()});
  const response = await fetch('/mail.php' + (body ? '' : '?' + query), {method: body ? 'POST' : 'GET', headers, cache: 'no-store', redirect: 'error', ...(body ? {body: JSON.stringify(body)} : {})});
  let payload;
  try { payload = await response.json(); } catch { throw new Error('Email is unavailable right now.'); }
  if (!response.ok) throw Object.assign(new Error(payload.error?.message || 'Email is unavailable right now.'), {code: payload.error?.code});
  return payload.data;
}

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function when(seconds) {
  if (!seconds) return '';
  const date = new Date(seconds * 1000), now = new Date();
  return date.toDateString() === now.toDateString()
    ? date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})
    : date.toLocaleDateString([], {weekday: 'short', day: 'numeric', month: 'short'});
}

function message(target, text, link) {
  const box = el('div', 'empty-sm mail-empty', text);
  if (link) { box.append(document.createElement('br')); const a = el('a', '', link); a.href = '#settings'; box.append(a); }
  target.replaceChildren(box);
}

/** The model writes "## Heading" and "- bullet" lines; anything else is a paragraph. */
function renderSummary(target, text) {
  const nodes = [];
  let list = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/\*\*/g, '');
    if (!line) { list = null; continue; }
    if (line.startsWith('#')) { list = null; nodes.push(el('h4', 'mail-summary-head', line.replace(/^#+\s*/, ''))); continue; }
    if (/^[-*•]\s+/.test(line)) {
      if (!list) { list = el('ul', 'mail-summary-list'); nodes.push(list); }
      list.append(el('li', '', line.replace(/^[-*•]\s+/, '')));
      continue;
    }
    list = null;
    nodes.push(el('p', nodes.length ? 'mail-summary-text' : 'mail-summary-lead', line));
  }
  const body = el('div', 'mail-summary-body');
  body.dir = 'auto';
  body.append(...nodes);
  target.replaceChildren(body);
}

function setBusy(kind, busy) {
  state.busy[kind] = busy;
  const button = row.querySelector(`[data-mail-refresh="${kind}"]`);
  if (button) { button.disabled = busy; button.classList.toggle('is-spinning', busy); }
  row.querySelector(kind === 'summary' ? '#mailSummary' : '#mailInbox')?.setAttribute('aria-busy', String(busy));
}

async function loadSummary(generate = false) {
  if (state.busy.summary) return;
  const target = row.querySelector('#mailSummary'), foot = row.querySelector('#mailSummaryFoot');
  setBusy('summary', true);
  if (generate) message(target, 'Reading the last 24 hours of email and writing your summary…');
  try {
    let data = generate ? await mailApi({action: 'digest'}) : await mailApi(null, 'view=digest');
    if (!data.aiReady) { foot.textContent = ''; message(target, 'Choose an AI provider and model to get a daily summary.', 'Set up in Settings'); return; }
    if (!data.digest && !state.autoRequested) {
      // The first visit of the day writes the summary; later visits reuse it.
      state.autoRequested = true;
      setBusy('summary', false);
      return loadSummary(true);
    }
    if (!data.digest) { message(target, 'No summary yet today.'); return; }
    renderSummary(target, data.digest.summary);
    const d = data.digest;
    foot.textContent = d.count ? `${d.count === d.total ? d.count : `Newest ${d.count} of ${d.total}`} email${d.total === 1 ? '' : 's'} · ${d.model} · ${when(d.createdAt)}` : `Checked ${when(d.createdAt)}`;
  } catch (error) {
    foot.textContent = '';
    message(target, error.message, error.code === 'mail_secret_unreadable' || error.code === 'mail_auth_failed' ? 'Open Settings' : undefined);
  } finally { setBusy('summary', false); }
}

async function loadInbox(refresh = false) {
  if (state.busy.inbox) return;
  const target = row.querySelector('#mailInbox'), count = row.querySelector('#mailUnread');
  setBusy('inbox', true);
  try {
    const data = await mailApi(null, 'view=inbox' + (refresh ? '&refresh=1' : ''));
    state.loadedAt = Date.now();
    const unread = data.messages.filter(item => item.unread).length;
    count.textContent = unread ? `${unread} unread` : 'All read';
    if (!data.messages.length) { message(target, 'Your inbox is empty.'); return; }
    const list = el('ul', 'mail-list');
    for (const item of data.messages.slice(0, 12)) {
      const entry = el(item.link ? 'a' : 'div', 'mail-item' + (item.unread ? ' is-unread' : ''));
      // A Persian or Arabic message mirrors as a whole: sender, time and unread dot.
      // Children carry no dir of their own, so the sender name decides the direction.
      entry.dir = 'auto';
      if (item.link) { entry.href = item.link; entry.target = '_blank'; entry.rel = 'noopener noreferrer'; }
      const top = el('span', 'mail-item-top');
      const from = el('span', 'mail-from', item.fromName); from.title = item.fromEmail;
      const time = el('time', 'mail-time', when(item.receivedAt)); time.dir = 'ltr';
      top.append(from, time);
      const subject = el('span', 'mail-subject', item.subject);
      const snippet = el('span', 'mail-snippet', item.snippet);
      entry.append(top, subject, snippet);
      if (item.unread) entry.setAttribute('aria-label', `Unread: ${item.fromName}, ${item.subject}`);
      const li = el('li'); li.append(entry); list.append(li);
    }
    target.replaceChildren(list);
  } catch (error) {
    count.textContent = '';
    message(target, error.message, error.code === 'mail_auth_failed' || error.code === 'mail_secret_unreadable' ? 'Open Settings' : undefined);
  } finally { setBusy('inbox', false); }
}

async function refreshMail(force = false) {
  if (!row || document.getElementById('dashboard')?.hidden) return;
  if (!force && state.connected !== null && Date.now() - state.loadedAt < REFRESH_MS) return;
  try {
    const settings = await mailApi(null, 'view=settings');
    state.connected = settings.connected;
  } catch { return; }
  row.classList.toggle('is-disconnected', !state.connected);
  if (!state.connected) { state.loadedAt = Date.now(); return; }
  loadInbox();
  loadSummary();
}

export function mountMailCard(main) {
  row = document.createElement('section');
  row.className = 'dash-row two mail-row is-disconnected';
  row.setAttribute('aria-label', 'Email');
  row.innerHTML = `
    <article class="dash-card mail-card"><div class="card-head"><div><span class="card-kicker">EMAIL · LAST 24 HOURS</span><h3 class="card-title">Morning summary</h3></div><button type="button" class="mail-refresh" data-mail-refresh="summary" aria-label="Write a new summary" title="Write a new summary">${REFRESH_ICON}</button></div><div id="mailSummary" class="mail-summary" aria-live="polite"></div><p class="mail-foot" id="mailSummaryFoot"></p></article>
    <article class="dash-card mail-card"><div class="card-head"><div><span class="card-kicker">INBOX</span><h3 class="card-title">Recent email</h3></div><div class="mail-head-side"><span class="card-extra" id="mailUnread"></span><button type="button" class="mail-refresh" data-mail-refresh="inbox" aria-label="Check for new email" title="Check for new email">${REFRESH_ICON}</button></div></div><div id="mailInbox" class="mail-inbox"></div></article>
    <article class="dash-card mail-connect"><div><span class="card-kicker">EMAIL</span><h3 class="card-title">Your inbox, summarized</h3><p>Connect your mailbox to see recent email here, with an AI summary of the last day each morning.</p></div><a class="mail-connect-link" href="#settings">Connect email</a></article>`;
  main.querySelector('.dash-metrics').after(row);
  row.querySelector('[data-mail-refresh="summary"]').addEventListener('click', () => loadSummary(true));
  row.querySelector('[data-mail-refresh="inbox"]').addEventListener('click', () => loadInbox(true));
  refreshMail(true);
  addEventListener('hashchange', () => { if (location.hash === '' || location.hash === '#dashboard') refreshMail(true); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshMail(); });
  setInterval(() => { if (!document.hidden) refreshMail(); }, 60000);
}
