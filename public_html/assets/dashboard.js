const readJson = (key) => {
  try { return JSON.parse(appStorage.getItem(key) || 'null'); } catch { return null; }
};
const number = (value) => new Intl.NumberFormat('en-US').format(Number(value) || 0);
const $ = (id) => document.getElementById(id);
const set = (id, value) => { const node = $(id); if (node) node.textContent = value; };
const isArray = (value) => Array.isArray(value);
const safeArray = (value) => isArray(value) ? value : [];
const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));
const ARROW_UP = '<svg class="darr" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2l4.5 7h-9z" fill="currentColor"/></svg>';
const ARROW_DOWN = '<svg class="darr" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 10L1.5 3h9z" fill="currentColor"/></svg>';

const tehranKeyNow = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const tehranDayOfWeek = () => new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tehran', weekday: 'long' }).format(new Date());
const tehranLongDate = () => new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tehran', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date());
const tehranHour = () => Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tehran', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));

function addDaysISO(key, delta) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}
function weekdayShort(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d) + 43200000));
}
function roundDownTo(value, step) {
  const rounded = Math.floor((Number(value) || 0) / step) * step;
  return Math.max(step, rounded === 0 ? step : rounded);
}
function smoothPath(points) {
  if (points.length < 2) return '';
  const slopes = points.slice(1).map((point, i) =>
    (point.y - points[i].y) / (point.x - points[i].x));
  const tangent = points.map((_, i) => {
    if (i === 0) return slopes[0];
    if (i === points.length - 1) return slopes[slopes.length - 1];
    const before = slopes[i - 1], after = slopes[i];
    return before * after <= 0 ? 0 : 2 * before * after / (before + after);
  });
  let path = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i], end = points[i + 1];
    const third = (end.x - start.x) / 3;
    path += ` C ${(start.x + third).toFixed(1)},${(start.y + tangent[i] * third).toFixed(1)}`;
    path += ` ${(end.x - third).toFixed(1)},${(end.y - tangent[i + 1] * third).toFixed(1)}`;
    path += ` ${end.x.toFixed(1)},${end.y.toFixed(1)}`;
  }
  return path;
}

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
    <header class="dash-topbar" aria-labelledby="dashboard-heading">
      <div><span class="dash-kicker">LIFE &amp; WORK OS · TEHRAN</span><h1 id="dashboard-heading" tabindex="-1"></h1><p></p></div>
      <div class="dash-date-chip" aria-label="Today in Tehran"><time id="dashboard-date"></time><small id="dashboard-weekday"></small></div>
    </header>

    <section class="dash-score" aria-label="Productivity score">
      <div class="score-ring-wrap" aria-hidden="true">
        <svg viewBox="0 0 120 120"><defs><linearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--accent)"/><stop offset="1" stop-color="#2bd39c"/></linearGradient></defs><circle class="ring-bg" cx="60" cy="60" r="52"/><circle class="ring-fg" id="ring-fg" cx="60" cy="60" r="52" fill="none" stroke-dasharray="326.73" stroke-dashoffset="326.73"/></svg>
        <div class="score-center"><strong id="score-value">0</strong><span>Score</span></div>
      </div>
      <div class="score-head">
        <span class="dash-kicker">TODAY · PERFORMANCE INDEX</span>
        <h2>Your productivity pulse</h2>
        <p id="score-copy">A live composite of how your day is shaping up across focus, habits, goals and work.</p>
        <span class="score-grade">Grade: <em id="score-grade">—</em></span><span class="score-delta" id="score-delta"></span>
        <div class="score-parts" aria-label="Score breakdown">
          <div class="score-part"><small>Focus</small><strong id="part-focus">0</strong><span class="part-track"><span class="part-fill" id="fill-focus"></span></span></div>
          <div class="score-part"><small>Habits</small><strong id="part-habits">0</strong><span class="part-track"><span class="part-fill" id="fill-habits"></span></span></div>
          <div class="score-part"><small>Goals</small><strong id="part-goals">0</strong><span class="part-track"><span class="part-fill" id="fill-goals"></span></span></div>
          <div class="score-part"><small>Work</small><strong id="part-work">0</strong><span class="part-track"><span class="part-fill" id="fill-work"></span></span></div>
        </div>
      </div>
    </section>

    <section class="dash-metrics" aria-label="Key metrics today">
      <a href="#focus" class="dash-metric"><div class="metric-top"><span class="metric-symbol symbol-focus" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg></span><span class="metric-delta flat" id="focus-delta">—</span></div><span class="metric-label">Focus time today</span><span class="metric-value-row"><strong class="metric-value" id="m-focus">0</strong><span class="metric-unit">min</span></span><span class="metric-foot" id="m-focus-foot"></span></a>
      <a href="#habittify" class="dash-metric"><div class="metric-top"><span class="metric-symbol symbol-habit" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span><span class="metric-delta flat" id="habit-delta">—</span></div><span class="metric-label">Habits completed</span><span class="metric-value-row"><strong class="metric-value" id="m-habits">0</strong><span class="metric-unit" id="m-habits-unit">/ 0</span></span><span class="metric-foot" id="m-habits-foot">Loading…</span><span class="metric-track"><span id="m-habits-track"></span></span></a>
      <a href="#goals" class="dash-metric"><div class="metric-top"><span class="metric-symbol symbol-goal" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg></span><span class="metric-delta flat" id="goal-delta">—</span></div><span class="metric-label">Active goals</span><span class="metric-value-row"><strong class="metric-value" id="m-goals">0</strong><span class="metric-unit">open</span></span><span class="metric-foot" id="m-goals-foot"></span></a>
      <a href="#kanban" class="dash-metric"><div class="metric-top"><span class="metric-symbol symbol-work" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="5" height="16" rx="1"/><rect x="9.5" y="4" width="5" height="11" rx="1"/><rect x="16" y="4" width="5" height="7" rx="1"/></svg></span><span class="metric-delta flat" id="task-delta">—</span></div><span class="metric-label">Cards in flight</span><span class="metric-value-row"><strong class="metric-value" id="m-tasks">0</strong><span class="metric-unit">moving</span></span><span class="metric-foot" id="m-tasks-foot"></span><span class="metric-track"><span id="m-tasks-track"></span></span></a>
    </section>

    <section class="dash-row" aria-label="Focus and habit charts">
      <article class="dash-card"><div class="card-head"><div><span class="card-kicker">FOCUS · LAST 14 DAYS</span><h3 class="card-title">Deep-work minutes</h3></div><div class="card-extra"><strong id="focus-14-total">0</strong>min total</div></div><div id="focus-chart" class="rise"></div></article>
      <article class="dash-card"><div class="card-head"><div><span class="card-kicker">HABITS · LAST 14 DAYS</span><h3 class="card-title">Completion rate</h3></div><div class="card-extra"><strong id="habit-14-avg">0%</strong>avg daily</div></div><div id="habit-chart" class="rise"></div></article>
    </section>

    <section class="dash-row two" aria-label="Habit heatmap and insights">
      <article class="dash-card"><div class="card-head"><div><span class="card-kicker">STREAK MAP · 16 WEEKS</span><h3 class="card-title">Habit streak</h3></div><div class="card-extra" id="heat-extra"></div></div><div class="heat-wrap"><div class="heat-cells" id="heat-grid" role="img" aria-label="Daily habit completion for the last sixteen weeks"></div></div><div class="heat-legend"><span>Less</span><i class="level-0"></i><i class="level-1"></i><i class="level-2"></i><i class="level-3"></i><i class="level-4"></i><span>More</span></div></article>
      <article class="dash-card"><div class="card-head"><div><span class="card-kicker">INSIGHTS</span><h3 class="card-title">Signals worth knowing</h3></div></div><div class="insight-list" id="insight-list"></div></article>
    </section>

    <section class="dash-row tri" aria-label="Goals, workflow and finance">
      <article class="dash-card"><div class="card-head"><div><span class="card-kicker">TARGETS</span><h3 class="card-title">Goal progress</h3></div></div><div id="goal-list"></div></article>
      <article class="dash-card"><div class="card-head"><div><span class="card-kicker">WORKFLOW</span><h3 class="card-title">Kanban load</h3></div></div><div id="flow-body"></div></article>
      <article class="dash-card"><div class="card-head"><div><span class="card-kicker">FINANCE · CURRENT PERIOD</span><h3 class="card-title">Spend watch</h3></div></div><div id="fin-body"></div></article>
    </section>

    <nav class="dash-launch" aria-label="Applications">
      <a href="#focus"><i style="background:#c49bff"></i>Focus</a>
      <a href="#finance"><i style="background:#3bb273"></i>Finance</a>
      <a href="#habittify"><i style="background:#39e6ad"></i>Habittify</a>
      <a href="#kanban"><i style="background:#7dbafa"></i>Kanban</a>
      <a href="#goals"><i style="background:#f3c969"></i>Goals</a>
      <a href="#notes"><i style="background:#ff9ec4"></i>Notes</a>
      <a href="#notepad"><i style="background:#b79cff"></i>Notepad</a>
    </nav>
    <p class="dash-privacy">Your data is saved in MySQL on this server.</p>`;

  document.getElementById('focus').before(main);
  addEventListener('storage', () => { if (!main.hidden) refreshDashboard(); });
  addEventListener('app-storage-change', () => { if (!main.hidden) refreshDashboard(); });
  addEventListener('focus', () => { if (!main.hidden) refreshDashboard(); });
}

let refreshSequence = 0;
let lastScore = 0;

export async function refreshDashboard() {
  const sequence = ++refreshSequence;
  const today = tehranKeyNow();
  const hour = tehranHour();
  const greeting = hour < 6 ? 'Working late' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 21 ? 'Good evening' : 'Winding down';
  $('dashboard-heading').textContent = greeting + '.';
  $('dashboard-heading').nextElementSibling.textContent = 'Live analytics across everything that moves your life and work forward.';
  $('dashboard-date').textContent = tehranLongDate();
  $('dashboard-weekday').textContent = tehranDayOfWeek();

  const focus = readJson('edi_focus_v1');
  const history = safeArray(focus?.history);
  const focusByDay = {};
  for (const item of history) {
    if (!item?.day) continue;
    const minutes = Number(item?.minutes) || 0;
    focusByDay[item.day] = (focusByDay[item.day] || 0) + minutes;
  }

  // ── focus: today, 7-day window, deltas ─────────────────────────────
  const todayMin = focusByDay[today] || 0;
  let weekMin = 0, prevMin = 0, weekDays = 0;
  for (let i = 1; i <= 7; i++) {
    const key = addDaysISO(today, -i);
    const minutes = focusByDay[key] || 0;
    if (minutes > 0) weekDays++;
    weekMin += minutes;
  }
  for (let i = 8; i <= 14; i++) prevMin += focusByDay[addDaysISO(today, -i)] || 0;
  const avg7 = weekMin / 7;
  const avgPrev = prevMin / 7;
  const todaySessions = history.filter(item => item?.day === today).length;
  const weekSessions = history.filter(item => { const k = item?.day; return k >= addDaysISO(today, -7) && k <= today; }).length;
  const focusPct = clamp(avg7 / 90 * 100); // 90 focused minutes/day = full score
  renderMetricDelta('focus-delta', todayMin, avg7, 'min');
  set('m-focus', number(todayMin));
  set('m-focus-foot', `${number(todaySessions)} session${todaySessions === 1 ? '' : 's'} today · week avg ${number(Math.round(avg7))} min`);

  // ── goals ──────────────────────────────────────────────────────────
  const goalsData = readJson('edi_goals_v1');
  const goals = safeArray(goalsData?.goals).filter(g => g && g.status !== 'archived');
  const activeGoals = goals.filter(g => !(isArray(g.tasks) && g.tasks.length && g.tasks.every(t => t.done)));
  const goalProgress = activeGoals.map(g => {
    const tasks = safeArray(g.tasks);
    const done = tasks.filter(t => t.done).length;
    return { goal: g, total: tasks.length, done, pct: tasks.length ? done / tasks.length * 100 : 0 };
  });
  const goalAvg = goalProgress.length ? goalProgress.reduce((sum, g) => sum + g.pct, 0) / goalProgress.length : 0;
  const dueSoon = activeGoals.filter(g => {
    if (!g.deadline) return false;
    return (new Date(g.deadline + 'T00:00:00') - new Date(today + 'T00:00:00')) <= 7 * 86400000;
  }).length;
  const goalDelta = $('goal-delta');
  if (goalDelta) { goalDelta.textContent = dueSoon ? `${number(dueSoon)} soon` : 'on track'; goalDelta.className = 'metric-delta flat'; }
  set('m-goals', number(activeGoals.length));
  set('m-goals-foot', dueSoon ? `${number(dueSoon)} due within a week · avg ${number(Math.round(goalAvg))}%` : `avg progress ${number(Math.round(goalAvg))}%`);
  set('part-goals', `${number(Math.round(goalAvg))}%`);
  animateFill('fill-goals', goalAvg);

  // ── kanban ─────────────────────────────────────────────────────────
  const boardsData = readJson('kanban_boards_v1');
  const boards = safeArray(boardsData?.boards);
  const allCards = boards.flatMap(board => safeArray(board?.columns).flatMap(col => safeArray(col?.cards).map(card => ({ board: board.name, column: col.name || '', card }))));
  const doneCards = allCards.filter(item => /done/i.test(item.column)).length;
  const inFlight = allCards.filter(item => !/done/i.test(item.column)).length;
  const doneShare = allCards.length ? doneCards / allCards.length * 100 : 0;
  const taskDelta = $('task-delta');
  if (taskDelta) { taskDelta.textContent = `${number(allCards.length ? Math.round(doneShare) : 0)}% done`; taskDelta.className = 'metric-delta flat'; }
  set('m-tasks', number(inFlight));
  set('m-tasks-foot', `${number(doneCards)} done · ${number(allCards.length)} total across ${number(boards.length)} board${boards.length === 1 ? '' : 's'}`);
  animateFill('m-tasks-track', doneShare);
  const donePulse = allCards.length ? Math.round(doneShare) : 0;
  set('part-work', `${number(donePulse)}%`);
  animateFill('fill-work', doneShare);

  // ── habit data (async) ─────────────────────────────────────────────
  let habits = [];
  let logs = {};
  let habitsOk = false;
  try {
    const start16 = addDaysISO(today, -(16 * 7 - 1));
    const [habitResponse, logResponse] = await Promise.all([
      fetch('habittify/api.php?route=habits', { headers: { Accept: 'application/json' } }),
      fetch(`habittify/api.php?route=logs&start=${start16}&end=${today}`, { headers: { Accept: 'application/json' } })
    ]);
    if (!habitResponse.ok || !logResponse.ok) throw new Error('unavailable');
    const [habitData, logData] = await Promise.all([habitResponse.json(), logResponse.json()]);
    if (sequence !== refreshSequence) return;
    habits = safeArray(habitData.habits);
    logs = logData.logs || {};
    habitsOk = true;
  } catch {
    if (sequence !== refreshSequence) return;
  }
  const habitIds = new Set(habits.map(h => h.id));
  const totalHabits = habits.length;
  const completion = (key) => {
    if (!totalHabits) return 0;
    const done = (logs[key] || []).filter(id => habitIds.has(id)).length;
    return done / totalHabits * 100;
  };
  const todayPct = completion(today);
  const todayDone = (logs[today] || []).filter(id => habitIds.has(id)).length;
  let habitAvg = 0, habitPrev = 0;
  for (let i = 1; i <= 7; i++) habitAvg += completion(addDaysISO(today, -i));
  for (let i = 8; i <= 14; i++) habitPrev += completion(addDaysISO(today, -i));
  habitAvg /= 7; habitPrev /= 7;
  const habitPct = clamp(todayMin > 0 ? todayPct : habitAvg);
  renderMetricDelta('habit-delta', todayPct, habitAvg);
  set('m-habits', number(todayDone));
  set('m-habits-unit', `/ ${number(totalHabits)}`);
  set('m-habits-foot', habitsOk ? `${number(Math.round(todayPct))}% of daily habits` : 'Open Habittify to view progress');
  animateFill('m-habits-track', todayPct);
  set('part-habits', `${number(Math.round(habitAvg))}%`);
  animateFill('fill-habits', habitAvg);

  // ── productivity score ─────────────────────────────────────────────
  const weights = [focusPct, habitAvg, goalAvg, doneShare].filter(v => v > 0);
  const score = weights.length ? Math.round(weights.reduce((a, b) => a + b, 0) / weights.length) : 0;
  const prevParts = [clamp(avgPrev / 90 * 100), habitPrev, 0, doneShare].filter(v => v > 0);
  const prevScore = prevParts.length ? Math.round(prevParts.reduce((a, b) => a + b, 0) / prevParts.length) : 0;
  const grade = score >= 90 ? 'Exceptional' : score >= 75 ? 'Strong' : score >= 60 ? 'Steady' : score >= 40 ? 'Building' : score >= 20 ? 'Starting' : 'Warming up';
  set('score-grade', grade);
  set('score-copy', scoreMessage(score, todayMin, todayPct));
  animateRing(score);
  animateNumber('score-value', score);
  set('part-focus', `${number(Math.round(focusPct))}%`);
  set('part-goals', `${number(Math.round(goalAvg))}%`);
  set('part-habits', `${number(Math.round(habitAvg))}%`);
  set('part-work', `${number(donePulse)}%`);
  animateFill('fill-focus', focusPct);
  animateFill('fill-goals', goalAvg);
  animateFill('fill-habits', habitAvg);
  animateFill('fill-work', doneShare);
  renderScoreDelta(score, prevScore);

  // ── focus chart (14 days) ──────────────────────────────────────────
  renderFocusChart(today, focusByDay, todaySessions, weekSessions);

  // ── habit chart (14 days) ──────────────────────────────────────────
  renderHabitChart(today, completion, totalHabits, habitAvg);

  // ── heatmap ────────────────────────────────────────────────────────
  renderHeatmap(today, completion, totalHabits, habitsOk);

  // ── insights ───────────────────────────────────────────────────────
  renderInsights(today, focusByDay, habitsOk, todayDone, totalHabits, history);

  // ── goals list ─────────────────────────────────────────────────────
  renderGoalList(goalProgress, today);

  // ── flow ───────────────────────────────────────────────────────────
  renderFlow(allCards, boards);

  // ── finance ────────────────────────────────────────────────────────
  renderFinance();
}

function scoreMessage(score, todayMin, todayPct) {
  if (score >= 75) return 'Strong output today — the compound is working. Keep the cadence and protect the next block.';
  if (score >= 50) return `Solid rhythm. ${todayMin > 0 ? number(todayMin) + ' min focused' : 'No focus yet'} and ${number(Math.round(todayPct))}% of habits handled.`;
  if (score >= 25) return 'Your score combines progress across focus, habits, goals and work.';
  return 'Everything starts somewhere. Set one goal, run one session, complete one habit.';
}

function renderMetricDelta(id, current, baseline, unit = '') {
  const node = $(id);
  if (!node) return;
  if (baseline <= 0 || current <= 0) { node.textContent = '—'; node.className = 'metric-delta flat'; return; }
  const pct = Math.round((current - baseline) / baseline * 100);
  if (Math.abs(pct) < 1) { node.textContent = '0%'; node.className = 'metric-delta flat'; return; }
  node.innerHTML = `${pct > 0 ? ARROW_UP : ARROW_DOWN}<span>${Math.abs(pct)}%</span>`;
  node.className = `metric-delta ${pct > 0 ? 'up' : 'down'}`;
}

function renderScoreDelta(score, prev) {
  const node = $('score-delta');
  if (!node) return;
  if (prev <= 0) { node.textContent = 'vs last week — establishing baseline'; node.className = 'score-delta'; return; }
  const diff = score - prev;
  node.innerHTML = `${diff >= 0 ? ARROW_UP : ARROW_DOWN}<span>${Math.abs(diff)} pts vs last week</span>`;
  node.className = `score-delta ${diff >= 0 ? 'up' : 'down'}`;
}

function animateRing(score) {
  const ring = $('ring-fg');
  if (!ring) return;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  ring.setAttribute('stroke-dasharray', circumference.toFixed(2));
  requestAnimationFrame(() => {
    ring.style.strokeDashoffset = (circumference * (1 - clamp(score) / 100)).toFixed(2);
  });
}
function animateFill(id, pct) {
  const node = $(id);
  if (!node) return;
  requestAnimationFrame(() => { node.style.width = `${clamp(pct)}%`; });
}
function animateNumber(id, value) {
  const node = $(id);
  if (!node) return;
  const from = lastScore;
  lastScore = value;
  const start = Date.now();
  function frame() {
    const t = Math.min(1, (Date.now() - start) / 700);
    const eased = 1 - Math.pow(1 - t, 3);
    node.textContent = number(Math.round(from + (value - from) * eased));
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function renderFocusChart(today, focusByDay) {
  const wrap = $('focus-chart');
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const key = addDaysISO(today, -i);
    days.push({ key, minutes: focusByDay[key] || 0 });
  }
  const total = days.reduce((sum, d) => sum + d.minutes, 0);
  set('focus-14-total', number(total));
  const max = roundDownTo(Math.max(...days.map(d => d.minutes), 0), 15);
  const W = 600, H = 200, padL = 44, padR = 10, padT = 14, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const y = (v) => padT + plotH * (1 - v / max);
  const x = (i) => padL + (i / (days.length - 1)) * plotW;
  const points = days.map((d, i) => ({ x: x(i), y: y(d.minutes) }));
  const line = smoothPath(points);
  const area = `${line} L ${x(days.length - 1).toFixed(1)},${(padT + plotH).toFixed(1)} L ${padL},${(padT + plotH).toFixed(1)} Z`;
  let grid = '';
  for (let level = 0; level <= 4; level++) {
    const value = max * level / 4;
    const yy = y(value).toFixed(1);
    grid += `<line class="sv-gridline" x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}"/><text class="sv-y" x="${padL - 8}" y="${Number(yy) + 3}">${level === 0 ? 0 : Math.round(value)}</text>`;
  }
  let labels = '';
  days.forEach((d, i) => {
    if (i % 2 === 1 && i !== days.length - 1) return;
    labels += `<text class="sv-x" x="${x(i)}" y="${H - 8}" text-anchor="middle">${weekdayShort(d.key)}</text>`;
  });
  let dots = '';
  days.forEach((d, i) => {
    if (d.minutes <= 0) return;
    dots += `<circle class="sv-dot" cx="${x(i).toFixed(1)}" cy="${y(d.minutes).toFixed(1)}" r="3"><title>${weekdayShort(d.key)} ${number(d.minutes)} min</title></circle>`;
  });
  wrap.innerHTML = days.some(d => d.minutes > 0) ? `
    <svg class="sv-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Focused minutes per day for the last fourteen days">
      <defs><linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".28"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
      ${grid}<path class="sv-area" d="${area}"/><path class="sv-line" d="${line}"/>${dots}${labels}
    </svg>` : `<div class="chart-empty rise">No focus sessions in the last 14 days.<br>Start one from the Focus app to see the curve grow.</div>`;
}

function renderHabitChart(today, completion, totalHabits, habitAvg) {
  const wrap = $('habit-chart');
  set('habit-14-avg', `${number(Math.round(habitAvg))}%`);
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const key = addDaysISO(today, -i);
    days.push({ key, pct: completion(key) });
  }
  const W = 600, H = 200, padL = 44, padR = 10, padT = 14, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const barW = (plotW / days.length) * 0.4;
  let bars = '', labels = '';
  days.forEach((d, i) => {
    const cx = padL + (i / (days.length - 1)) * plotW;
    const bh = d.pct > 0 ? Math.max(4, plotH * d.pct / 100) : 3;
    const yy = padT + plotH - bh;
    const fill = d.pct > 0 ? `var(--accent)` : `var(--surface-2)`;
    const stroke = d.pct > 0 ? `var(--accent)` : `var(--border)`;
    bars += `<rect class="sv-bar" x="${(cx - barW / 2).toFixed(1)}" y="${yy.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="${d.pct > 0 ? 0 : 1}"><title>${weekdayShort(d.key)} ${number(Math.round(d.pct))}% complete</title></rect>`;
    if (i % 2 === 1 && i !== days.length - 1) return;
    labels += `<text class="sv-x" x="${cx}" y="${H - 8}" text-anchor="middle">${weekdayShort(d.key)}</text>`;
  });
  for (let level = 0; level <= 4; level++) {
    const yy = padT + plotH - plotH * level / 4;
    bars = `<line class="sv-gridline" x1="${padL}" y1="${yy.toFixed(1)}" x2="${W - padR}" y2="${yy.toFixed(1)}"/><text class="sv-y" x="${padL - 14}" y="${yy + 3}">${level === 0 ? 0 : level * 25}</text>` + bars;
  }
  wrap.innerHTML = totalHabits ? `
    <svg class="sv-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily habit completion percentage for the last fourteen days">
      ${bars}${labels}
    </svg>` : `<div class="chart-empty rise">No habits yet.<br>Add your first habit in Habittify to unlock the completion curve.</div>`;
}

function renderHeatmap(today, completion, totalHabits, habitsOk) {
  const grid = $('heat-grid');
  if (!grid) return;
  const start = addDaysISO(today, -(16 * 7 - 1));
  const edit = (key) => {
    const pct = completion(key);
    if (!pct) return 0;
    if (pct >= 0.99) return 4;
    if (pct >= 0.66) return 3;
    if (pct >= 0.33) return 2;
    return 1;
  };
  let cells = '';
  let made = 0;
  for (let week = 0; week < 16; week++) {
    for (let day = 0; day < 7; day++) {
      const key = addDaysISO(start, week * 7 + day);
      if (key > today) { cells += `<span class="heat-cell level-0"></span>`; continue; }
      const level = edit(key);
      if (level > 0) made++;
      cells += `<span class="heat-cell level-${level}${key === today ? ' today' : ''}" title="${key}: ${number(Math.round(completion(key)))}% complete"></span>`;
    }
  }
  grid.innerHTML = habitsOk ? cells : `<div class="empty-sm" style="grid-column:1/-1">No habit data yet.</div>`;
  set('heat-extra', made ? `${number(made)} strong days` : '');
}

function renderInsights(today, focusByDay, habitsOk, todayDone, totalHabits, history) {
  const list = $('insight-list');
  const icoClock = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>';
  const icoStar = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><polygon points="12 3 14.5 9 21 9.5 16 14 17.5 21 12 17.5 6.5 21 8 14 3 9.5 9.5 9"/></svg>';
  const icoBolt = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M13 2L5 14h6l-2 8 8-12h-6l2-8z"/></svg>';
  const icoCheck = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  const insights = [];
  let streak = 0;
  let cursor = today;
  if (!(focusByDay[cursor] > 0)) cursor = addDaysISO(today, -1);
  while (focusByDay[cursor] > 0) { streak++; cursor = addDaysISO(cursor, -1); }
  if (streak > 0) insights.push({ icon: icoClock, title: `${number(streak)}-day focus streak`, text: `Focus on ${streak > 1 ? 'every one of the last ' + number(streak) + ' days' : 'yesterday and counting today'} — momentum is your multiplier.` });
  else insights.push({ icon: icoClock, title: 'No active streak', text: 'A single 25-minute session today starts a fresh focus streak.' });

  const best = history.reduce((acc, item) => (Number(item?.minutes) || 0) > (Number(acc?.minutes) || 0) ? item : acc, null);
  if (best?.day) {
    insights.push({ icon: icoStar, title: `Best day · ${number(best.minutes)} min`, text: `${best.day} — your personal record in the log so far.` });
  }

  const totalMin = history.reduce((sum, item) => sum + (Number(item?.minutes) || 0), 0);
  const totalSessions = history.filter(item => Number(item?.minutes) > 0).length;
  insights.push({ icon: icoBolt, title: `${number(totalMin)} min deep work`, text: `${number(totalSessions)} session${totalSessions === 1 ? '' : 's'} logged in total · ${number(Math.round(totalMin / 60))} hours of deliberate focus.` });

  if (habitsOk) {
    insights.push({ icon: icoCheck, title: `${number(todayDone)} of ${number(totalHabits)} habits today`, text: todayDone === totalHabits && totalHabits > 0 ? 'Perfect day — every habit checked. Bank it.' : 'Small, repeatable wins compound faster than occasional grand gestures.' });
  }

  list.innerHTML = insights.slice(0, 4).map((item, i) =>
    `<div class="insight-item rise" style="animation-delay:${i * 60}ms"><span class="insight-dot" aria-hidden="true">${item.icon}</span><div><strong>${item.title}</strong><span>${item.text}</span></div></div>`
  ).join('');
}

function renderGoalList(goalProgress, today) {
  const wrap = $('goal-list');
  const sorted = [...goalProgress].sort((a, b) => {
    const pa = ['high', 'medium', 'low'].indexOf(a.goal.priority) >= 0 ? ['high', 'medium', 'low'].indexOf(a.goal.priority) : 1;
    const pb = ['high', 'medium', 'low'].indexOf(b.goal.priority) >= 0 ? ['high', 'medium', 'low'].indexOf(b.goal.priority) : 1;
    if (pa !== pb) return pa - pb;
    if (!a.goal.deadline && !b.goal.deadline) return a.goal.title.localeCompare(b.goal.title);
    if (!a.goal.deadline) return 1;
    if (!b.goal.deadline) return -1;
    return new Date(a.goal.deadline) - new Date(b.goal.deadline);
  }).slice(0, 4);
  if (!sorted.length) {
    wrap.innerHTML = `<div class="empty-sm">No active goals yet.<br>Set a SMART goal to start tracking real outcomes.</div>`;
    return;
  }
  wrap.innerHTML = sorted.map(({ goal, total, done, pct }) => {
    let chip = '<span class="chip flat">no deadline</span>';
    if (goal.deadline) {
      const days = Math.round((new Date(goal.deadline + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
      if (days < 0) chip = `<span class="chip overdue">${Math.abs(days)}d overdue</span>`;
      else if (days === 0) chip = `<span class="chip soon">due today</span>`;
      else if (days <= 7) chip = `<span class="chip soon">${days}d left</span>`;
      else chip = `<span class="chip ok">${days}d left</span>`;
    }
    return `<div class="goal-row">
      <div class="goal-head"><span class="goal-name">${goal.title}<span class="goal-cat">${goal.category || 'General'}${total ? ` · ${done}/${total} tasks` : ''}</span></span><span class="goal-pct">${number(Math.round(pct))}%</span></div>
      <span class="goal-track"><span class="goal-fill" data-w="${clamp(pct)}"></span></span>
      <span class="goal-meta"><span>${goal.metric || ''}</span>${chip}</span>
    </div>`;
  }).join('');
  requestAnimationFrame(() => wrap.querySelectorAll('.goal-fill').forEach(el => { el.style.width = `${el.dataset.w}%`; }));
}

function renderFlow(allCards, boards) {
  const wrap = $('flow-body');
  if (!allCards.length) {
    wrap.innerHTML = `<div class="empty-sm">No cards yet.<br>Open Kanban and add your first task to see the pipeline.</div>`;
    return;
  }
  const groups = ['Backlog', 'To Do', 'In Progress', 'To Review', 'Done'];
  const counts = groups.map(name => allCards.filter(item => {
    if (name === 'Done') return /done/i.test(item.column);
    if (name === 'To Review') return /review/i.test(item.column);
    if (name === 'In Progress') return /in prog|doing|work/i.test(item.column);
    if (name === 'To Do') return /^to do$|todo/i.test(item.column);
    return /backlog/i.test(item.column);
  }).length);
  const total = allCards.length;
  const stack = counts.map((count, i) => `<i class="fc-${i}" style="width:${(count / total * 100).toFixed(1)}%" title="${count} ${groups[i]}"></i>`).join('');
  const legend = groups.map((name, i) => counts[i] ? `<span class="flow-item"><span><i class="fc-${i}"></i>${name}</span><b>${number(counts[i])}</b></span>` : '').join('');
  const inFlight = counts[1] + counts[2] + counts[3];
  const done = counts[4];
  wrap.innerHTML = `
    <div class="flow-stack" aria-label="Card distribution">${stack}</div>
    <div class="flow-legend">${legend}</div>
    <div class="flow-stats">
      <span class="flow-stat"><small>Total cards</small><strong>${number(total)}</strong></span>
      <span class="flow-stat"><small>In flight</small><strong>${number(inFlight)}</strong></span>
      <span class="flow-stat"><small>Completed</small><strong>${number(done)}</strong></span>
      <span class="flow-stat"><small>Boards</small><strong>${number(boards.length)}</strong></span>
    </div>`;
}

function renderFinance() {
  const wrap = $('fin-body');
  const periods = readJson('daramd_periods_v1');
  const periodName = appStorage.getItem('daramd_active_period_v1') || 'Current';
  const ledger = periods?.[periodName] || readJson('daramd_v1');
  const categories = safeArray(ledger?.categories);
  const incomes = safeArray(ledger?.incomes || ledger?.income || []);
  const expenses = safeArray(ledger?.expenses);
  const income = incomes.reduce((sum, item) => sum + (Number(item?.amount) || 0), 0);
  const spent = expenses.reduce((sum, item) => sum + (Number(item?.amount) || 0), 0);
  const balance = income - spent;
  const byCategory = {};
  for (const exp of expenses) byCategory[exp?.categoryId] = (byCategory[exp?.categoryId] || 0) + (Number(exp?.amount) || 0);
  const top = Object.entries(byCategory)
    .map(([id, amount]) => ({ category: categories.find(c => c.id === id), amount }))
    .filter(item => item.category)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);
  if (!expenses.length && !income) {
    wrap.innerHTML = `<div class="empty-sm">No entries in this period.<br>Track a transaction in Finance to light up the spend watch.</div>`;
    return;
  }
  wrap.innerHTML = `
    <div class="fin-row"><strong class="fin-balance">${number(balance)}<span>Toman</span></strong></div>
    <div class="fin-sub"><span class="fin-pill in">+${number(income)} in</span><span class="fin-pill out">−${number(spent)} out</span></div>
    <div class="fin-cats">${top.map(({ category, amount }) => {
      const pct = category.target > 0 ? clamp(amount / category.target * 100) : 100;
      const over = category.target > 0 && amount > category.target;
      return `<div class="fin-cat">
        <div class="fin-cat-head"><span>${category.label}${over ? ' · over' : ''}</span><b>${number(Math.round(pct))}% of budget</b></div>
        <span class="fin-cat-track"><span class="fin-cat-fill" data-w="${pct}" style="${over ? 'background:var(--danger)' : ''}"></span></span>
      </div>`;
    }).join('')}</div>`;
  requestAnimationFrame(() => wrap.querySelectorAll('.fin-cat-fill').forEach(el => { el.style.width = `${el.dataset.w}%`; }));
}
