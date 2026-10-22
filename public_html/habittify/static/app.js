const JALALI_MONTHS = [
  "Farvardin",
  "Ordibehesht",
  "Khordad",
  "Tir",
  "Mordad",
  "Shahrivar",
  "Mehr",
  "Aban",
  "Azar",
  "Dey",
  "Bahman",
  "Esfand",
];
const JALALI_MONTHS_FA = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];
const GREGORIAN_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const { t, number } = window.lifeOsI18n;
// Years and day numbers read as plain digits (no thousands separator).
const plain = value => number(value, { useGrouping: false });
const pctText = value => t("{value}%", { value: number(value) });
const monthName = jm => t(JALALI_MONTHS[jm - 1]);
const monthYear = j => t("{month} {year}", { month: monthName(j.jm), year: plain(j.jy) });
const jalaliLabel = j => t("{day} {month} {year}", { day: plain(j.jd), month: monthName(j.jm), year: plain(j.jy) });
// Shared with Settings. Gregorian unless the user picks the Jalali calendar.
const CALENDAR_KEY = "edi_calendar_v1";

const state = {
  habits: [],
  categories: [],
  logs: {},
  recentLogs: {},
  activityLogs: {},
  activityRange: null,
  month: null,
  calendar: "gregorian",
  today: new Date(),
};

const $ = (id) => document.getElementById(id);

function pad(num) {
  return String(num).padStart(2, "0");
}
function toISODate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function div(a, b) {
  return Math.floor(a / b);
}

function g2j(gy, gm, gd) {
  const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  gy -= gy <= 1600 ? 621 : 1600;
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    365 * gy +
    div(gy2 + 3, 4) -
    div(gy2 + 99, 100) +
    div(gy2 + 399, 400) -
    80 +
    gd +
    gdm[gm - 1];
  jy += 33 * div(days, 12053);
  days %= 12053;
  jy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) {
    jy += div(days - 1, 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return { jy, jm, jd };
}

function j2g(jy, jm, jd) {
  let gy = jy <= 979 ? 621 : 1600;
  jy -= jy <= 979 ? 0 : 979;
  let days =
    365 * jy +
    8 * div(jy, 33) +
    div((jy % 33) + 3, 4) +
    78 +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  gy += 400 * div(days, 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * div(--days, 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) {
    gy += div(days - 1, 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const sal = [0, 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (gm = 1; gm <= 12 && gd > sal[gm]; gm++) gd -= sal[gm];
  return { gy, gm, gd };
}

function dateFromJalali(jy, jm, jd) {
  const g = j2g(jy, jm, jd);
  return new Date(g.gy, g.gm - 1, g.gd);
}

function jalaliFromDate(date) {
  return g2j(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function jalaliMonthLength(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  const start = dateFromJalali(jy, 1, 1);
  const next = dateFromJalali(jy + 1, 1, 1);
  const yearDays = Math.round((next - start) / 86400000);
  return yearDays === 366 ? 30 : 29;
}

function normalizeMonth(jy, jm) {
  while (jm < 1) {
    jm += 12;
    jy--;
  }
  while (jm > 12) {
    jm -= 12;
    jy++;
  }
  return { jy, jm };
}

function getMonthDays(jy, jm) {
  const len = jalaliMonthLength(jy, jm);
  return Array.from({ length: len }, (_, i) => {
    const jd = i + 1;
    const date = dateFromJalali(jy, jm, jd);
    return { jy, jm, jd, date, iso: toISODate(date), weekday: date.getDay() };
  });
}

// Calendar-neutral helpers: months are { y, m } in the active calendar, while
// every stored log date stays a Gregorian YYYY-MM-DD.
function readCalendar() {
  try {
    return appStorage.getItem(CALENDAR_KEY) === "jalali" ? "jalali" : "gregorian";
  } catch {
    return "gregorian";
  }
}

function monthOf(date) {
  if (state.calendar === "jalali") {
    const j = jalaliFromDate(date);
    return { y: j.jy, m: j.jm };
  }
  return { y: date.getFullYear(), m: date.getMonth() + 1 };
}

function shiftMonth({ y, m }, delta) {
  const next = normalizeMonth(y, m + delta);
  return { y: next.jy, m: next.jm };
}

function sameMonth(a, b) {
  return a.y === b.y && a.m === b.m;
}

function monthDays({ y, m }) {
  if (state.calendar === "jalali") return getMonthDays(y, m).map((day) => ({ ...day, d: day.jd }));
  const length = new Date(y, m, 0).getDate();
  return Array.from({ length }, (_, i) => {
    const date = new Date(y, m - 1, i + 1);
    return { d: i + 1, date, iso: toISODate(date), weekday: date.getDay() };
  });
}

function monthLabel({ y, m }) {
  return t("{month} {year}", {month:t((state.calendar === "jalali" ? JALALI_MONTHS : GREGORIAN_MONTHS)[m - 1]), year:plain(y)});
}

function dayLabel(date) {
  if (state.calendar === "jalali") {
    const j = jalaliFromDate(date);
    return jalaliLabel(j);
  }
  return t("{day} {month} {year}", {day:plain(date.getDate()), month:t(GREGORIAN_MONTHS[date.getMonth()]), year:plain(date.getFullYear())});
}

async function api(path, options = {}) {
  const [routePath, query = ""] = path.replace(/^\/api\/?/, "").split("?");
  const endpoint = `api.php?route=${encodeURIComponent(routePath)}${query ? `&${query}` : ""}`;
  const headers = { "Content-Type": "application/json" };
  if ((options.method || "GET").toUpperCase() !== "GET") {
    headers["X-CSRF-Token"] = await appStorage.csrfToken();
  }
  const response = await fetch(endpoint, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(t(data.error || "Request failed"));
  return data;
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(
    () => toast.classList.remove("show"),
    1800,
  );
}

async function loadHabits() {
  const data = await api("/api/habits");
  state.habits = data.habits.map((habit) => ({ ...habit, id: Number(habit.id) }));
}

async function loadLogs() {
  const days = monthDays(state.month);
  const start = days[0].iso;
  const end = days[days.length - 1].iso;
  const data = await api(`/api/logs?start=${start}&end=${end}`);
  state.logs = data.logs || {};
}

async function loadCategories() {
  const data = await api("/api/categories");
  state.categories = data.categories.map((category) => ({ ...category, id: Number(category.id) }));
}

async function loadRecentLogs() {
  const end = new Date(), start = new Date(end);
  start.setDate(start.getDate() - 6);
  const data = await api(`/api/logs?start=${toISODate(start)}&end=${toISODate(end)}`);
  state.recentLogs = data.logs || {};
}

function renderDailyProgress() {
  const today = toISODate(new Date());
  const doneIds = new Set((state.recentLogs[today] || []).map(Number));
  const done = state.habits.filter(habit => doneIds.has(habit.id)).length;
  const total = state.habits.length;
  $('todayCount').textContent = t("{done} / {total} done", { done: number(done), total: number(total) });
  $('todayProgressFill').style.width = `${total ? done / total * 100 : 0}%`;
  $('todayEncouragement').textContent = !total ? t('Start with one small habit.') : done === total ? t('Your daily practice is complete. Well done.') : done ? t(total - done === 1 ? '{count} small step left for today.' : '{count} small steps left for today.', { count: number(total - done) }) : t('A fresh start. Pick one habit to begin.');
  let completed = 0, possible = 0, activeDays = 0;
  const bars = [];
  for (let offset = 6; offset >= 0; offset--) {
    const date = new Date(); date.setDate(date.getDate() - offset);
    const key = toISODate(date), ids = new Set((state.recentLogs[key] || []).map(Number));
    const eligible = state.habits.filter(habit => !habit.created_at || habit.created_at.slice(0, 10) <= key);
    const count = eligible.filter(habit => ids.has(habit.id)).length;
    completed += count; possible += eligible.length; if (count) activeDays++;
    const pct = eligible.length ? Math.round(count / eligible.length * 100) : 0;
    const weekday = window.lifeOsI18n.date(date, {weekday:'short'});
    bars.push(`<div class="week-day ${offset === 0 ? 'is-today' : ''}" title="${escapeHtml(t('{date}: {done}/{total} completed', { date: window.lifeOsI18n.digits(key), done: number(count), total: number(eligible.length) }))}"><div class="week-bar"><span style="height:${pct}%"></span></div><small>${weekday}</small></div>`);
  }
  $('weekBars').innerHTML = bars.join('');
  $('weekCompletion').textContent = possible ? pctText(Math.round(completed / possible * 100)) : '—';
  $('weekCheckins').textContent = number(completed);
  $('weekActiveDays').textContent = `${number(activeDays)} / ${number(7)}`;
}

async function loadActivity() {
  const days = monthDays(state.month);
  const start = days[0].date;
  const end = days[days.length - 1].date;
  const data = await api(
    `/api/logs?start=${toISODate(start)}&end=${toISODate(end)}`,
  );
  state.activityLogs = data.logs || {};
  state.activityRange = { start, end };
}

function isDone(habitId, iso) {
  return (state.logs[iso] || []).includes(habitId);
}

function setDoneLocal(habitId, iso, done) {
  const list = new Set(state.logs[iso] || []);
  done ? list.add(habitId) : list.delete(habitId);
  state.logs[iso] = Array.from(list);
  const recent = new Set(state.recentLogs[iso] || []);
  done ? recent.add(habitId) : recent.delete(habitId);
  state.recentLogs[iso] = Array.from(recent);
}

function renderHabitList() {
  $("habitCount").textContent = t("{count} active", { count: number(state.habits.length) });
  const list = $("habitList");
  if (!state.habits.length) {
    list.innerHTML = `<div class="empty-state">${escapeHtml(t("No habits yet. Add your first habit above."))}</div>`;
    return;
  }

  list.innerHTML = state.habits.map((habit) => `
    <article class="habit-item">
      <div class="habit-name">${escapeHtml(habit.name)}</div>
      <button class="icon-btn habit-edit" data-edit="${habit.id}" title="${escapeHtml(t("Edit habit"))}" aria-label="${escapeHtml(t("Edit {name}", { name: habit.name }))}">⋯</button>
    </article>
  `).join("");

  list.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () =>
      openEditDialog(Number(button.dataset.edit)),
    );
  });
}

function renderCategorySelect(selectEl, selectedValue) {
  const options = [`<option value="">${escapeHtml(t("Uncategorized"))}</option>`].concat(
    state.categories.map(
      (cat) =>
        `<option value="${escapeHtml(cat.name)}">${escapeHtml(cat.name)}</option>`,
    ),
  );
  selectEl.innerHTML = options.join("");
  selectEl.value = state.categories.some((cat) => cat.name === selectedValue)
    ? selectedValue
    : "";
}

function renderCategoryList() {
  $("categoryCount").textContent = t("{count} categories", { count: number(state.categories.length) });
  const list = $("categoryList");
  if (!state.categories.length) {
    list.innerHTML = `<div class="empty-state">${escapeHtml(t("No categories yet. Add one above."))}</div>`;
    return;
  }

  const usage = {};
  state.habits.forEach((habit) => {
    if (habit.category)
      usage[habit.category] = (usage[habit.category] || 0) + 1;
  });

  list.innerHTML = state.categories
    .map(
      (cat) => `
    <div class="category-item">
      <div>
        <span class="category-name">${escapeHtml(cat.name)}</span>
        <span class="category-usage">${escapeHtml(t(usage[cat.name] === 1 ? "{count} habit" : "{count} habits", { count: number(usage[cat.name] || 0) }))}</span>
      </div>
      <div class="category-actions">
        <button class="ghost-btn" data-rename-cat="${cat.id}">${escapeHtml(t("Rename"))}</button>
        <button class="ghost-btn danger-text" data-delete-cat="${cat.id}">${escapeHtml(t("Delete"))}</button>
      </div>
    </div>
  `,
    )
    .join("");

  list.querySelectorAll("[data-rename-cat]").forEach((button) => {
    button.addEventListener("click", () =>
      renameCategory(Number(button.dataset.renameCat)),
    );
  });
  list.querySelectorAll("[data-delete-cat]").forEach((button) => {
    button.addEventListener("click", () =>
      deleteCategory(Number(button.dataset.deleteCat)),
    );
  });
}

async function renameCategory(id) {
  const category = state.categories.find((cat) => cat.id === id);
  if (!category) return;
  const input = window.prompt(t("Rename category"), category.name);
  if (input === null) return;
  const name = input.trim();
  if (!name || name === category.name) return;
  try {
    await api(`/api/categories/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
    });
    await refresh();
    showToast(t("Category renamed"));
  } catch (error) {
    showToast(error.message);
  }
}

async function deleteCategory(id) {
  const category = state.categories.find((cat) => cat.id === id);
  if (!category) return;
  if (
    !confirm(
      t("Delete category “{name}”? Habits using it become uncategorized.", { name: category.name }),
    )
  )
    return;
  await api(`/api/categories/${id}`, { method: "DELETE" });
  await refresh();
  showToast(t("Category deleted"));
}

function activityLevel(doneCount, totalHabits) {
  if (!doneCount || !totalHabits) return 0;
  const ratio = doneCount / totalHabits;
  if (ratio >= 0.99) return 4;
  if (ratio >= 0.66) return 3;
  if (ratio >= 0.33) return 2;
  return 1;
}

function renderActivityGrid() {
  if (!state.activityRange) return;
  const { start, end } = state.activityRange;
  const activeIds = new Set(state.habits.map((h) => h.id));
  const totalHabits = state.habits.length;
  const leadingBlanks = start.getDay();

  let html = "";
  for (let i = 0; i < leadingBlanks; i++) {
    html += `<div class="activity-cell is-empty"></div>`;
  }

  const dayCount = Math.round((end - start) / 86400000) + 1;
  for (let i = 0; i < dayCount; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const iso = toISODate(date);
    const doneCount = (state.activityLogs[iso] || []).filter((id) =>
      activeIds.has(id),
    ).length;
    const level = activityLevel(doneCount, totalHabits);
    const label = `${dayLabel(date)} · ${t("{done}/{total} done", { done: number(doneCount), total: number(totalHabits) })}`;
    html += `<div class="activity-cell level-${level}" title="${escapeHtml(label)}"></div>`;
  }

  $("activityGrid").innerHTML = html;
  $("activitySubtitle").textContent =
    `${monthLabel(state.month)} · ${window.lifeOsI18n.digits(toISODate(start))} ${window.lifeOsI18n.dir() === "rtl" ? "←" : "→"} ${window.lifeOsI18n.digits(toISODate(end))}`;
}

function renderHeader(days) {
  $("monthName").textContent = monthLabel(state.month);
  $("monthDateRange").textContent = dayLabel(new Date());
}

function renderTodayList() {
  const todayIso = toISODate(new Date());
  $("todayDateLabel").textContent = dayLabel(new Date());

  const list = $("todayList");
  renderDailyProgress();
  if (!state.habits.length) {
    list.innerHTML = `<div class="empty-state"><span class="empty-symbol" aria-hidden="true">◇</span><strong>${escapeHtml(t("Begin with something small"))}</strong>${escapeHtml(t("Read one page. Take a short walk."))}<br>${escapeHtml(t("Create a habit you can repeat."))}</div>`;
    return;
  }

  list.innerHTML = state.habits
    .map((habit) => {
      const done = (state.recentLogs[todayIso] || []).map(Number).includes(habit.id);
      return `
      <div class="today-item ${done ? "done" : ""}" data-today-habit="${habit.id}">
        <button class="today-check ${done ? "done" : ""}" data-toggle-today="${habit.id}" aria-label="${escapeHtml(t(done ? "Uncheck {name} for today" : "Complete {name} for today", { name: habit.name }))}" aria-pressed="${done}">✓</button>
        <div><span class="today-name" dir="auto">${escapeHtml(habit.name)}</span><span class="today-meta">${escapeHtml(habit.category || t("Daily practice"))}</span></div>
        <button class="icon-btn" data-edit-today="${habit.id}" aria-label="${escapeHtml(t("Edit {name}", { name: habit.name }))}">⋯</button>
      </div>
    `;
    })
    .join("");

  list.querySelectorAll("[data-toggle-today]").forEach((button) => {
    button.addEventListener("click", () =>
      toggleToday(Number(button.dataset.toggleToday)),
    );
  });
  list.querySelectorAll('[data-edit-today]').forEach(button => button.addEventListener('click', () => openEditDialog(Number(button.dataset.editToday))));
}

async function toggleToday(habitId) {
  const todayIso = toISODate(new Date());
  const habit = state.habits.find((item) => item.id === habitId);
  if (!habit) return;
  const button = document.querySelector(`[data-toggle-today="${habitId}"]`);
  if (button?.disabled) return;
  if (button) button.disabled = true;
  let data;
  try { data = await api("/api/logs/toggle", {
    method: "POST",
    body: JSON.stringify({ habit_id: habitId, date: todayIso, done: !isDone(habitId, todayIso) }),
  }); } catch (error) { showToast(error.message); if (button) button.disabled = false; return; }
  setDoneLocal(habitId, todayIso, data.done);
  renderTodayList();
  if (sameMonth(state.month, monthOf(new Date()))) {
    renderTable();
  } else {
    renderStats(monthDays(state.month));
  }
  await loadActivity();
  renderActivityGrid();
}

function renderTable() {
  const table = $("habitTable");
  const days = monthDays(state.month);
  renderHeader(days);
  renderTodayList();

  if (!state.habits.length) {
    table.innerHTML = `<tbody><tr><td class="empty-state">${escapeHtml(t("No habits yet. Use “Add habit” above to start tracking."))}</td></tr></tbody>`;
    renderStats(days);
    return;
  }

  const todayIso = toISODate(new Date());
  const head = `
    <caption class="sr-only">${escapeHtml(t("Habits and daily completion for {month}", { month: monthLabel(state.month) }))}</caption>
    <thead>
      <tr>
        <th scope="col">${escapeHtml(t("Habit"))}</th>
        ${days
          .map(
            (day) => `
          <th scope="col" class="${day.iso === todayIso ? "today-head" : ""}" aria-label="${escapeHtml(dayLabel(day.date))}, ${escapeHtml(t(WEEKDAYS_SHORT[day.weekday]))}">
            <div class="day-num">${plain(day.d)}</div>
            <div class="day-name">${escapeHtml(t(WEEKDAYS_SHORT[day.weekday]))}</div>
          </th>
        `,
          )
          .join("")}
      </tr>
    </thead>
  `;

  const body = `
    <tbody>
      ${state.habits
        .map(
          (habit) => `
        <tr>
          <th scope="row" class="habit-label-cell">
            <div class="habit-label">
              <span class="mini-dot"></span>
              <span class="table-label-text">
                <strong>${escapeHtml(habit.name)}</strong>
                <small>${escapeHtml(habit.category || t("Uncategorized"))}</small>
              </span>
            </div>
          </th>
          ${days
            .map((day) => {
              const done = isDone(habit.id, day.iso);
              return `
              <td class="check-cell">
                <button class="check-btn ${done ? "done" : ""}" data-habit="${habit.id}" data-date="${day.iso}" aria-label="${escapeHtml(habit.name)}, ${escapeHtml(dayLabel(day.date))}" aria-pressed="${done}" title="${escapeHtml(dayLabel(day.date))}"></button>
              </td>
            `;
            })
            .join("")}
        </tr>
      `,
        )
        .join("")}
    </tbody>
  `;

  table.innerHTML = head + body;
  table.querySelectorAll(".check-btn").forEach((button) => {
    button.addEventListener("click", () => toggleCell(button));
  });
  renderStats(days);
}

async function toggleCell(button) {
  if (button.disabled) return;
  button.disabled = true;
  const habitId = Number(button.dataset.habit);
  const date = button.dataset.date;
  const habit = state.habits.find((item) => item.id === habitId);
  let data;
  try { data = await api("/api/logs/toggle", {
    method: "POST",
    body: JSON.stringify({ habit_id: habitId, date, done: !isDone(habitId, date) }),
  }); } catch (error) { showToast(error.message); button.disabled = false; return; }
  button.disabled = false;
  setDoneLocal(habitId, date, data.done);
  button.classList.toggle("done", data.done);
  button.setAttribute("aria-pressed", String(data.done));
  renderStats(monthDays(state.month));
  if (date === toISODate(new Date())) renderTodayList();
  else renderDailyProgress();
  await loadActivity();
  renderActivityGrid();
}

function renderStats(days) {
  const activeIds = new Set(state.habits.map((h) => h.id));
  const today = toISODate(new Date());
  const eligibleDays = days.filter(day => day.iso <= today);
  const eligibleHabits = day => state.habits.filter(habit => !habit.created_at || habit.created_at.slice(0, 10) <= day.iso);
  const total = eligibleDays.reduce((sum, day) => sum + eligibleHabits(day).length, 0);
  const done = eligibleDays.reduce(
    (sum, day) =>
      sum +
      eligibleHabits(day).filter(habit => (state.logs[day.iso] || []).map(Number).includes(habit.id)).length,
    0,
  );
  const percent = total ? Math.round((done / total) * 100) : 0;

  $("monthCompletionPill").textContent = eligibleDays.length ? t("{percent} · elapsed days", { percent: pctText(percent) }) : t('Future month');
  const activeDays = eligibleDays.filter((day) =>
    (state.logs[day.iso] || []).some((id) => activeIds.has(id)),
  ).length;
  const consistency = activeIds.size && eligibleDays.length
    ? Math.round((activeDays / eligibleDays.length) * 100)
    : 0;
  $("consistencyRate").textContent = eligibleDays.length
    ? t("Consistency {percent} · {active}/{total} days active", { percent: pctText(consistency), active: number(activeDays), total: number(eligibleDays.length) })
    : t("Consistency — · Future month");
}

function openEditDialog(id) {
  const habit = state.habits.find((item) => item.id === id);
  if (!habit) return;
  $("editHabitId").value = habit.id;
  $("editHabitName").value = habit.name;
  renderCategorySelect($("editHabitCategory"), habit.category || "");
  $("editDialog").showModal();
}

async function saveEdit() {
  const id = Number($("editHabitId").value);
  const name = $("editHabitName").value.trim();
  if (!name) {
    showToast(t("Habit name is required"));
    return;
  }
  await api(`/api/habits/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      name,
      category: $("editHabitCategory").value.trim(),
      color: "#64748b",
    }),
  });
  $("editDialog").close();
  await refresh();
  showToast(t("Habit updated"));
}

async function deleteCurrentHabit() {
  const id = Number($("editHabitId").value);
  const habit = state.habits.find((item) => item.id === id);
  if (!habit) return;
  if (
    !confirm(t("Remove “{name}”? This also deletes its check-in history.", { name: habit.name }))
  )
    return;
  await api(`/api/habits/${id}`, { method: "DELETE" });
  $("editDialog").close();
  await refresh();
  showToast(t("Habit removed"));
}

const escapeHtml = globalThis.lifeOsHtml.escapeHtml;

function sanitizeColor() {
  return "#64748b";
}

async function refresh() {
  await Promise.all([loadHabits(), loadCategories()]);
  await Promise.all([loadLogs(), loadActivity(), loadRecentLogs()]);
  renderCategorySelect($("habitCategory"), "");
  renderCategoryList();
  renderHabitList();
  renderTable();
  renderActivityGrid();
}

function bindEvents() {
  const focusAddHabit = () => {
    $('addDialog').showModal();
    const input = $("habitName");
    input.focus();
  };
  $("gridAddHabit").addEventListener("click", focusAddHabit);
  $('closeAdd').addEventListener('click', () => $('addDialog').close());
  $('cancelAdd').addEventListener('click', () => $('addDialog').close());

  $("prevMonth").addEventListener("click", async () => {
    state.month = shiftMonth(state.month, -1);
    await Promise.all([loadLogs(), loadActivity()]);
    renderTable();
    renderActivityGrid();
  });

  $("nextMonth").addEventListener("click", async () => {
    state.month = shiftMonth(state.month, 1);
    await Promise.all([loadLogs(), loadActivity()]);
    renderTable();
    renderActivityGrid();
  });

  $("todayBtn").addEventListener("click", async () => {
    state.month = monthOf(new Date());
    await Promise.all([loadLogs(), loadActivity()]);
    renderTable();
    renderActivityGrid();
    showToast(t("Returned to current month"));
  });

  $("addForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const nameInput = $("habitName");
    const name = nameInput.value.trim();
    if (!name) return;
    const submit = event.currentTarget.querySelector('[type="submit"]') || event.currentTarget.querySelector('.primary-btn');
    if (submit.disabled) return;
    submit.disabled = true;
    try { await api("/api/habits", {
      method: "POST",
      body: JSON.stringify({
        name,
        category: $("habitCategory").value.trim(),
        color: "#64748b",
      }),
    });
    nameInput.value = "";
    $("habitCategory").value = "";
    await refresh();
    $('addDialog').close();
    showToast(t("Habit added"));
    } catch (error) { showToast(error.message); }
    finally { submit.disabled = false; }
  });

  $("categoryAddForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = $("categoryName");
    const name = input.value.trim();
    if (!name) return;
    try {
      await api("/api/categories", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      input.value = "";
      await refresh();
      showToast(t("Category added"));
    } catch (error) {
      showToast(error.message);
    }
  });

  $("editForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveEdit();
  });

  $("closeEdit").addEventListener("click", () => $("editDialog").close());
  $("deleteHabit").addEventListener("click", deleteCurrentHabit);
}

async function boot() {
  state.calendar = readCalendar();
  state.month = monthOf(new Date());
  bindEvents();
  await refresh();
  // Follow a calendar change made in Settings without a reload.
  addEventListener("app-storage-change", async () => {
    const calendar = readCalendar();
    if (calendar === state.calendar) return;
    state.calendar = calendar;
    state.month = monthOf(new Date());
    await Promise.all([loadLogs(), loadActivity()]);
    renderTable();
    renderActivityGrid();
    renderTodayList();
  });
}

window.appStorageReady
  .then(() => {
    const theme = appStorage.getItem("edi_os_theme");
    if (theme) document.documentElement.dataset.theme = theme;
    return boot();
  })
  .catch((error) => showToast(error.message));
