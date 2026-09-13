const readJson = (key) => {
  try { return JSON.parse(appStorage.getItem(key) || 'null'); } catch { return null; }
};
const number = (value) => new Intl.NumberFormat('en-US').format(Number(value) || 0);
const tehranDay = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Tehran', year:'numeric', month:'2-digit', day:'2-digit'}).format(date);
const setText = (id, value) => { const node = document.getElementById(id); if (node) node.textContent = value; };
const safeArray = (value) => Array.isArray(value) ? value : [];

export function mountDashboard() {
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = 'assets/dashboard.css';
  document.head.append(stylesheet);
  const nav = document.querySelector('.os-nav nav');
  const overview = document.createElement('a');
  overview.href = '#dashboard';
  overview.innerHTML = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> Overview';
  nav.prepend(overview);
  document.querySelector('.brand').href = '#dashboard';
  const skip = document.createElement('a');
  skip.className = 'skip-link';
  skip.href = '#dashboard-heading';
  skip.textContent = 'Skip to main content';
  document.body.prepend(skip);

  const main = document.createElement('main');
  main.id = 'dashboard';
  main.className = 'dashboard';
  main.setAttribute('aria-labelledby', 'dashboard-heading');
  main.innerHTML = `
    <section class="dash-hero" aria-labelledby="dashboard-heading">
      <div class="dash-hero-copy"><span class="dash-kicker">YOUR SPACE · ONE CLEAR VIEW</span><h1 id="dashboard-heading" tabindex="-1">A good day starts here.</h1><p>Make progress across the things that matter. Pick up where you left off.</p><div class="dash-hero-actions"><a class="dash-primary" href="#focus">Start focusing <span aria-hidden="true">↗</span></a><a class="dash-secondary" href="#goals">See your goals <span aria-hidden="true">→</span></a></div></div>
      <div class="dash-orbit" aria-hidden="true"><div class="dash-orbit-ring ring-one"></div><div class="dash-orbit-ring ring-two"></div><div class="dash-orbit-core"><span>e.</span></div><span class="orbit-point point-one">✦</span><span class="orbit-point point-two">◉</span><span class="orbit-point point-three">✳</span></div>
    </section>
    <div class="dash-section-head"><div><span class="dash-kicker">TODAY AT A GLANCE</span><h2>Your momentum</h2></div><time id="dashboard-date"></time></div>
    <section class="dash-metrics" aria-label="Today’s summary">
      <a href="#focus" class="dash-metric"><span class="metric-symbol symbol-focus" aria-hidden="true">◷</span><span class="metric-label">Focus time today</span><strong id="dash-focus">0 min</strong><span class="metric-foot" id="dash-sessions">0 sessions completed</span></a>
      <a href="#habittify" class="dash-metric"><span class="metric-symbol symbol-habit" aria-hidden="true">✓</span><span class="metric-label">Habits today</span><strong id="dash-habits">—</strong><span class="metric-foot" id="dash-habit-detail">Checking your habits…</span><span class="mini-track" aria-hidden="true"><span id="dash-habit-fill"></span></span></a>
      <a href="#goals" class="dash-metric"><span class="metric-symbol symbol-goal" aria-hidden="true">◎</span><span class="metric-label">Active goals</span><strong id="dash-goals">0</strong><span class="metric-foot" id="dash-goal-detail">Set your next milestone</span></a>
      <a href="#kanban" class="dash-metric"><span class="metric-symbol symbol-board" aria-hidden="true">▦</span><span class="metric-label">Project cards</span><strong id="dash-cards">0</strong><span class="metric-foot" id="dash-board-detail">Across your boards</span></a>
    </section>
    <div class="dash-section-head dash-work-head"><div><span class="dash-kicker">YOUR WORKSPACE</span><h2>Go where you need to go</h2></div></div>
    <section class="dash-workspace" aria-label="Apps">
      <a class="dash-app app-focus" href="#focus"><span class="app-art" aria-hidden="true"><span class="art-clock">25<span>:</span>00</span></span><span class="app-bottom"><span><strong>Focus</strong><small>Find your flow</small></span><span class="app-arrow" aria-hidden="true">↗</span></span></a>
      <a class="dash-app app-finance" href="#finance"><span class="app-art" aria-hidden="true"><span class="art-bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span></span><span class="app-bottom"><span><strong>Finance</strong><small>Know your numbers</small></span><span class="app-arrow" aria-hidden="true">↗</span></span></a>
      <a class="dash-app app-habit" href="#habittify"><span class="app-art" aria-hidden="true"><span class="art-checks"><i>✓</i><i>✓</i><i>✓</i><i></i><i>✓</i><i></i><i>✓</i><i>✓</i><i></i></span></span><span class="app-bottom"><span><strong>Habittify</strong><small>Keep the streak alive</small></span><span class="app-arrow" aria-hidden="true">↗</span></span></a>
      <a class="dash-app app-kanban" href="#kanban"><span class="app-art" aria-hidden="true"><span class="art-kanban"><i></i><i></i><i></i></span></span><span class="app-bottom"><span><strong>Kanban</strong><small>Move work forward</small></span><span class="app-arrow" aria-hidden="true">↗</span></span></a>
      <a class="dash-app app-goals" href="#goals"><span class="app-art" aria-hidden="true"><span class="art-target"><i></i><i></i></span></span><span class="app-bottom"><span><strong>Goals</strong><small>See the bigger picture</small></span><span class="app-arrow" aria-hidden="true">↗</span></span></a>
      <a class="dash-app app-notes" href="#notes"><span class="app-art" aria-hidden="true"><span class="art-note"><i></i><i></i><i></i></span></span><span class="app-bottom"><span><strong>Notes</strong><small>Catch every thought</small></span><span class="app-arrow" aria-hidden="true">↗</span></span></a>
    </section>
    <section class="dash-lower" aria-label="More insights"><div class="dash-insight"><div><span class="dash-kicker">LAST 7 DAYS</span><h2>Focus rhythm</h2><p id="dash-week-summary">Your daily focus sessions, at a glance.</p></div><div id="dash-week-chart" class="dash-week-chart" role="img" aria-label="Focus sessions in the last seven days"></div></div><a href="#finance" class="dash-finance-panel"><span class="dash-kicker">CURRENT PERIOD</span><span class="dash-finance-heading">Your ledger <span aria-hidden="true">↗</span></span><strong id="dash-balance">—</strong><span id="dash-finance-detail">Open Finance to begin tracking</span><span class="finance-line" aria-hidden="true"><svg viewBox="0 0 280 70" preserveAspectRatio="none"><path d="M0 54 C35 52 44 34 76 42 S120 53 150 27 S196 43 220 20 S260 32 280 7"/></svg></span></a></section>
    <p class="dash-privacy">Your data is saved in MySQL on this server.</p>`;
  document.getElementById('focus').before(main);
  addEventListener('storage', () => { if (!main.hidden) refreshDashboard(); });
  addEventListener('app-storage-change', () => { if (!main.hidden) refreshDashboard(); });
  addEventListener('focus', () => { if (!main.hidden) refreshDashboard(); });
}

let refreshSequence = 0;
export async function refreshDashboard() {
  const sequence = ++refreshSequence;
  const today = tehranDay();
  document.getElementById('dashboard-date').dateTime = today;
  setText('dashboard-date', new Intl.DateTimeFormat('en', {timeZone:'Asia/Tehran', weekday:'long', month:'long', day:'numeric'}).format(new Date()));
  const focus = readJson('edi_focus_v1');
  const history = safeArray(focus?.history);
  const todayHistory = history.filter(item => item?.day === today);
  setText('dash-focus', `${number(todayHistory.reduce((sum, item) => sum + (Number(item?.minutes) || 0), 0))} min`);
  setText('dash-sessions', `${number(todayHistory.length)} session${todayHistory.length === 1 ? '' : 's'} completed`);

  const goals = safeArray(readJson('edi_goals_v1')?.goals);
  const activeGoals = goals.filter(goal => goal?.status !== 'completed' && goal?.status !== 'archived');
  setText('dash-goals', number(activeGoals.length));
  setText('dash-goal-detail', activeGoals.length ? `${number(goals.length)} total goals` : 'Set your next milestone');

  const boards = safeArray(readJson('kanban_boards_v1')?.boards);
  const cardCount = boards.reduce((sum, board) => sum + safeArray(board?.columns).reduce((count, column) => count + safeArray(column?.cards).length, 0), 0);
  setText('dash-cards', number(cardCount));
  setText('dash-board-detail', `${number(boards.length)} board${boards.length === 1 ? '' : 's'}`);

  const notes = safeArray(readJson('edi_notes_v1')?.notes);
  document.querySelector('.app-notes small').textContent = `${number(notes.length)} note${notes.length === 1 ? '' : 's'} saved`;

  const periods = readJson('daramd_periods_v1');
  const periodName = appStorage.getItem('daramd_active_period_v1') || 'Current';
  const ledger = periods?.[periodName] || readJson('daramd_v1');
  if (ledger) {
    const income = safeArray(ledger.incomes).reduce((sum, item) => sum + (Number(item?.amount) || 0), 0);
    const spent = safeArray(ledger.expenses).reduce((sum, item) => sum + (Number(item?.amount) || 0), 0);
    setText('dash-balance', `${number(income - spent)} Toman`);
    setText('dash-finance-detail', `${periodName} · ${number(spent)} Toman spent`);
  } else {
    setText('dash-balance', 'No entries yet');
    setText('dash-finance-detail', 'Open Finance to begin tracking');
  }

  const chart = document.getElementById('dash-week-chart');
  chart.replaceChildren();
  const days = Array.from({length:7}, (_, index) => {
    const date = new Date(Date.now() - (6 - index) * 86400000);
    const key = tehranDay(date);
    return {key, label: new Intl.DateTimeFormat('en', {timeZone:'Asia/Tehran', weekday:'short'}).format(date), count: history.filter(item => item?.day === key).length};
  });
  const highest = Math.max(1, ...days.map(day => day.count));
  for (const day of days) {
    const column = document.createElement('div');
    column.className = 'dash-chart-day';
    column.innerHTML = `<span class="dash-chart-bar"><span></span></span><span class="dash-chart-label"></span>`;
    column.querySelector('.dash-chart-bar span').style.height = `${Math.max(4, day.count / highest * 100)}%`;
    column.querySelector('.dash-chart-label').textContent = day.label;
    column.title = `${day.label}: ${day.count} focus session${day.count === 1 ? '' : 's'}`;
    chart.append(column);
  }
  chart.setAttribute('aria-label', `Focus sessions over the last seven days: ${days.map(day => `${day.label} ${day.count}`).join(', ')}`);
  setText('dash-week-summary', `${number(days.reduce((sum, day) => sum + day.count, 0))} sessions completed this week`);

  try {
    const [habitResponse, logResponse] = await Promise.all([
      fetch('habittify/api.php?route=habits', {headers:{Accept:'application/json'}}),
      fetch(`habittify/api.php?route=logs&start=${today}&end=${today}`, {headers:{Accept:'application/json'}})
    ]);
    if (!habitResponse.ok || !logResponse.ok) throw new Error('Habits unavailable');
    const [habitData, logData] = await Promise.all([habitResponse.json(), logResponse.json()]);
    if (sequence !== refreshSequence) return;
    const habits = safeArray(habitData.habits);
    const completed = safeArray(logData.logs?.[today]).filter(id => habits.some(habit => Number(habit.id) === Number(id))).length;
    setText('dash-habits', `${completed} / ${habits.length}`);
    setText('dash-habit-detail', habits.length ? `${Math.round(completed / habits.length * 100)}% of daily habits complete` : 'Add your first habit');
    document.getElementById('dash-habit-fill').style.width = `${habits.length ? completed / habits.length * 100 : 0}%`;
  } catch {
    if (sequence !== refreshSequence) return;
    setText('dash-habits', '—');
    setText('dash-habit-detail', 'Open Habittify to view progress');
    document.getElementById('dash-habit-fill').style.width = '0%';
  }
}
