const JALALI_MONTHS = ["Farvardin", "Ordibehesht", "Khordad", "Tir", "Mordad", "Shahrivar", "Mehr", "Aban", "Azar", "Dey", "Bahman", "Esfand"];
const JALALI_MONTHS_FA = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const state = {
  habits: [],
  categories: [],
  logs: {},
  activityLogs: {},
  activityRange: null,
  currentJ: null,
  today: new Date(),
};

const $ = (id) => document.getElementById(id);

function pad(num) { return String(num).padStart(2, "0"); }
function toISODate(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
function div(a, b) { return Math.floor(a / b); }

function g2j(gy, gm, gd) {
  const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  gy -= gy <= 1600 ? 621 : 1600;
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = (365 * gy) + div(gy2 + 3, 4) - div(gy2 + 99, 100) + div(gy2 + 399, 400) - 80 + gd + gdm[gm - 1];
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
  let days = (365 * jy) + (8 * div(jy, 33)) + div((jy % 33) + 3, 4) + 78 + jd + (jm < 7 ? (jm - 1) * 31 : ((jm - 7) * 30) + 186);
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
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0);
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
  while (jm < 1) { jm += 12; jy--; }
  while (jm > 12) { jm -= 12; jy++; }
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

async function api(path, options = {}) {
  const [routePath, query = ""] = path.replace(/^\/api\/?/, "").split("?");
  const endpoint = `api.php?route=${encodeURIComponent(routePath)}${query ? `&${query}` : ""}`;
  const response = await fetch(endpoint, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 1800);
}

async function loadHabits() {
  const data = await api("/api/habits");
  state.habits = data.habits;
}

async function loadLogs() {
  const days = getMonthDays(state.currentJ.jy, state.currentJ.jm);
  const start = days[0].iso;
  const end = days[days.length - 1].iso;
  const data = await api(`/api/logs?start=${start}&end=${end}`);
  state.logs = data.logs || {};
}

async function loadCategories() {
  const data = await api("/api/categories");
  state.categories = data.categories;
}

async function loadActivity() {
  const days = getMonthDays(state.currentJ.jy, state.currentJ.jm);
  const start = days[0].date;
  const end = days[days.length - 1].date;
  const data = await api(`/api/logs?start=${toISODate(start)}&end=${toISODate(end)}`);
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
}

function groupHabits() {
  return state.habits.reduce((groups, habit) => {
    const key = habit.category?.trim() || "Uncategorized";
    if (!groups[key]) groups[key] = [];
    groups[key].push(habit);
    return groups;
  }, {});
}

function renderHabitList() {
  $("habitCount").textContent = `${state.habits.length} active`;
  const list = $("habitList");
  if (!state.habits.length) {
    list.innerHTML = `<div class="empty-state">No habits yet. Add your first habit above.</div>`;
    return;
  }

  const groups = groupHabits();
  list.innerHTML = Object.entries(groups).map(([category, habits]) => `
    <section class="category-group">
      <div class="category-title">${escapeHtml(category)} · ${habits.length}</div>
      <div class="habit-row-wrap">
        ${habits.map(habit => `
          <article class="habit-item">
            <div class="habit-dot" style="background:${sanitizeColor(habit.color)}">${escapeHtml(habit.icon || "✓")}</div>
            <div>
              <div class="habit-name">${escapeHtml(habit.name)}</div>
              <div class="habit-meta">${escapeHtml(habit.category || "No category")}</div>
            </div>
            <div class="habit-actions">
              <button class="icon-btn habit-edit" data-edit="${habit.id}" title="Edit habit" aria-label="Edit ${escapeHtml(habit.name)}">•••</button>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `).join("");

  list.querySelectorAll("[data-edit]").forEach(button => {
    button.addEventListener("click", () => openEditDialog(Number(button.dataset.edit)));
  });

}

function renderCategorySelect(selectEl, selectedValue) {
  const options = [`<option value="">Uncategorized</option>`].concat(
    state.categories.map(cat => `<option value="${escapeHtml(cat.name)}">${escapeHtml(cat.name)}</option>`)
  );
  selectEl.innerHTML = options.join("");
  selectEl.value = state.categories.some(cat => cat.name === selectedValue) ? selectedValue : "";
}

function renderCategoryList() {
  $("categoryCount").textContent = `${state.categories.length} categories`;
  const list = $("categoryList");
  if (!state.categories.length) {
    list.innerHTML = `<div class="empty-state">No categories yet. Add one above.</div>`;
    return;
  }

  const usage = {};
  state.habits.forEach(habit => {
    if (habit.category) usage[habit.category] = (usage[habit.category] || 0) + 1;
  });

  list.innerHTML = state.categories.map(cat => `
    <div class="category-item">
      <div>
        <span class="category-name">${escapeHtml(cat.name)}</span>
        <span class="category-usage">${usage[cat.name] || 0} habit${usage[cat.name] === 1 ? "" : "s"}</span>
      </div>
      <div class="category-actions">
        <button class="ghost-btn" data-rename-cat="${cat.id}">Rename</button>
        <button class="ghost-btn danger-text" data-delete-cat="${cat.id}">Delete</button>
      </div>
    </div>
  `).join("");

  list.querySelectorAll("[data-rename-cat]").forEach(button => {
    button.addEventListener("click", () => renameCategory(Number(button.dataset.renameCat)));
  });
  list.querySelectorAll("[data-delete-cat]").forEach(button => {
    button.addEventListener("click", () => deleteCategory(Number(button.dataset.deleteCat)));
  });
}

async function renameCategory(id) {
  const category = state.categories.find(cat => cat.id === id);
  if (!category) return;
  const input = window.prompt("Rename category", category.name);
  if (input === null) return;
  const name = input.trim();
  if (!name || name === category.name) return;
  try {
    await api(`/api/categories/${id}`, { method: "PUT", body: JSON.stringify({ name }) });
    await refresh();
    showToast("Category renamed");
  } catch (error) {
    showToast(error.message);
  }
}

async function deleteCategory(id) {
  const category = state.categories.find(cat => cat.id === id);
  if (!category) return;
  if (!confirm(`Delete category “${category.name}”? Habits using it become uncategorized.`)) return;
  await api(`/api/categories/${id}`, { method: "DELETE" });
  await refresh();
  showToast("Category deleted");
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
  const activeIds = new Set(state.habits.map(h => h.id));
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
    const doneCount = (state.activityLogs[iso] || []).filter(id => activeIds.has(id)).length;
    const level = activityLevel(doneCount, totalHabits);
    const j = jalaliFromDate(date);
    const label = `${j.jd} ${JALALI_MONTHS[j.jm - 1]} ${j.jy} · ${doneCount}/${totalHabits} done`;
    html += `<div class="activity-cell level-${level}" title="${escapeHtml(label)}"></div>`;
  }

  $("activityGrid").innerHTML = html;
  $("activitySubtitle").textContent = `${JALALI_MONTHS[state.currentJ.jm - 1]} ${state.currentJ.jy} · ${toISODate(start)} → ${toISODate(end)}`;
}

function renderHeader(days) {
  const { jy, jm } = state.currentJ;
  $("monthName").textContent = `${JALALI_MONTHS[jm - 1]} ${jy}`;
  $("monthSubtitle").textContent = `${JALALI_MONTHS_FA[jm - 1]} ${jy} · ${days.length} days`;
}

function renderTodayList() {
  const todayIso = toISODate(new Date());
  const todayJ = jalaliFromDate(new Date());
  $("todayDateLabel").textContent = `${todayJ.jd} ${JALALI_MONTHS[todayJ.jm - 1]} ${todayJ.jy}`;

  const list = $("todayList");
  if (!state.habits.length) {
    list.innerHTML = `<div class="empty-state">No habits yet.</div>`;
    return;
  }

  list.innerHTML = state.habits.map(habit => {
    const done = isDone(habit.id, todayIso);
    return `
      <div class="today-item ${done ? "done" : ""}" data-today-habit="${habit.id}">
        <button class="today-check ${done ? "done" : ""}" style="${done ? `background:${sanitizeColor(habit.color)}` : ""}" data-toggle-today="${habit.id}">✓</button>
        <span class="today-name">${escapeHtml(habit.name)}</span>
        <span class="today-meta">${escapeHtml(habit.category || "")}</span>
      </div>
    `;
  }).join("");

  list.querySelectorAll("[data-toggle-today]").forEach(button => {
    button.addEventListener("click", () => toggleToday(Number(button.dataset.toggleToday)));
  });
}

async function toggleToday(habitId) {
  const todayIso = toISODate(new Date());
  const habit = state.habits.find(item => item.id === habitId);
  if (!habit) return;
  const data = await api("/api/logs/toggle", {
    method: "POST",
    body: JSON.stringify({ habit_id: habitId, date: todayIso }),
  });
  setDoneLocal(habitId, todayIso, data.done);
  renderTodayList();
  if (state.currentJ.jy === jalaliFromDate(new Date()).jy && state.currentJ.jm === jalaliFromDate(new Date()).jm) {
    renderTable();
  } else {
    renderStats(getMonthDays(state.currentJ.jy, state.currentJ.jm));
  }
  await loadActivity();
  renderActivityGrid();
}

function renderTable() {
  const table = $("habitTable");
  const days = getMonthDays(state.currentJ.jy, state.currentJ.jm);
  renderHeader(days);
  renderTodayList();

  if (!state.habits.length) {
    table.innerHTML = `<tbody><tr><td class="empty-state">Add habits to start tracking this month.</td></tr></tbody>`;
    renderStats(days);
    return;
  }

  const todayIso = toISODate(new Date());
  const head = `
    <thead>
      <tr>
        <th>Habit</th>
        ${days.map(day => `
          <th class="${day.iso === todayIso ? "today-head" : ""}">
            <div class="day-num">${day.jd}</div>
            <div class="day-name">${WEEKDAYS_SHORT[day.weekday]}</div>
          </th>
        `).join("")}
      </tr>
    </thead>
  `;

  const body = `
    <tbody>
      ${state.habits.map(habit => `
        <tr>
          <td class="habit-label-cell">
            <div class="habit-label">
              <span class="mini-dot" style="background:${sanitizeColor(habit.color)}"></span>
              <span class="table-label-text">
                <strong>${escapeHtml(habit.name)}</strong>
                <small>${escapeHtml(habit.category || "Uncategorized")}</small>
              </span>
            </div>
          </td>
          ${days.map(day => {
            const done = isDone(habit.id, day.iso);
            return `
              <td class="check-cell">
                <button class="check-btn ${done ? "done" : ""}" style="--habit-color:${sanitizeColor(habit.color)}" data-habit="${habit.id}" data-date="${day.iso}" aria-pressed="${done}" title="${day.jd} ${JALALI_MONTHS_FA[day.jm - 1]} ${day.jy}"></button>
              </td>
            `;
          }).join("")}
        </tr>
      `).join("")}
    </tbody>
  `;

  table.innerHTML = head + body;
  table.querySelectorAll(".check-btn").forEach(button => {
    button.addEventListener("click", () => toggleCell(button));
  });
  renderStats(days);
}

async function toggleCell(button) {
  const habitId = Number(button.dataset.habit);
  const date = button.dataset.date;
  const habit = state.habits.find(item => item.id === habitId);
  const data = await api("/api/logs/toggle", {
    method: "POST",
    body: JSON.stringify({ habit_id: habitId, date }),
  });
  setDoneLocal(habitId, date, data.done);
  button.classList.toggle("done", data.done);
  button.setAttribute("aria-pressed", String(data.done));
  renderStats(getMonthDays(state.currentJ.jy, state.currentJ.jm));
  if (date === toISODate(new Date())) renderTodayList();
  await loadActivity();
  renderActivityGrid();
}

function renderStats(days) {
  const activeIds = new Set(state.habits.map(h => h.id));
  const total = state.habits.length * days.length;
  const done = days.reduce((sum, day) => sum + (state.logs[day.iso] || []).filter(id => activeIds.has(id)).length, 0);
  const percent = total ? Math.round((done / total) * 100) : 0;

  $("monthCompletionPill").textContent = `${percent}% complete`;
}

function openEditDialog(id) {
  const habit = state.habits.find(item => item.id === id);
  if (!habit) return;
  $("editHabitId").value = habit.id;
  $("editHabitName").value = habit.name;
  renderCategorySelect($("editHabitCategory"), habit.category || "");
  $("editHabitIcon").value = habit.icon || "✓";
  $("editHabitColor").value = sanitizeColor(habit.color);
  $("editDialog").showModal();
}

async function saveEdit() {
  const id = Number($("editHabitId").value);
  const name = $("editHabitName").value.trim();
  if (!name) {
    showToast("Habit name is required");
    return;
  }
  await api(`/api/habits/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      name,
      category: $("editHabitCategory").value.trim(),
      icon: $("editHabitIcon").value.trim() || "✓",
      color: $("editHabitColor").value,
    }),
  });
  $("editDialog").close();
  await refresh();
  showToast("Habit updated");
}

async function deleteCurrentHabit() {
  const id = Number($("editHabitId").value);
  const habit = state.habits.find(item => item.id === id);
  if (!habit) return;
  if (!confirm(`Remove “${habit.name}”? This also deletes its check-in history.`)) return;
  await api(`/api/habits/${id}`, { method: "DELETE" });
  $("editDialog").close();
  await refresh();
  showToast("Habit removed");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function sanitizeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value)) ? value : "#39e6ad";
}

async function refresh() {
  await Promise.all([loadHabits(), loadCategories()]);
  await Promise.all([loadLogs(), loadActivity()]);
  renderCategorySelect($("habitCategory"), "");
  renderCategoryList();
  renderHabitList();
  renderTable();
  renderActivityGrid();
}

function bindEvents() {
  $("themeToggle").addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = nextTheme;
    try { localStorage.setItem("habittify_theme", nextTheme); } catch (error) {}
    showToast(`${nextTheme === "light" ? "Light" : "Dark"} theme enabled`);
  });

  $("prevMonth").addEventListener("click", async () => {
    state.currentJ = normalizeMonth(state.currentJ.jy, state.currentJ.jm - 1);
    await Promise.all([loadLogs(), loadActivity()]);
    renderTable();
    renderActivityGrid();
  });

  $("nextMonth").addEventListener("click", async () => {
    state.currentJ = normalizeMonth(state.currentJ.jy, state.currentJ.jm + 1);
    await Promise.all([loadLogs(), loadActivity()]);
    renderTable();
    renderActivityGrid();
  });

  $("todayBtn").addEventListener("click", async () => {
    state.currentJ = jalaliFromDate(new Date());
    await Promise.all([loadLogs(), loadActivity()]);
    renderTable();
    renderActivityGrid();
    showToast("Returned to current month");
  });

  $("addForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const nameInput = $("habitName");
    const name = nameInput.value.trim();
    if (!name) return;
    await api("/api/habits", {
      method: "POST",
      body: JSON.stringify({
        name,
        category: $("habitCategory").value.trim(),
        color: $("habitColor").value,
        icon: $("habitIcon").value.trim() || "✓",
      }),
    });
    nameInput.value = "";
    $("habitCategory").value = "";
    $("habitIcon").value = "✓";
    await refresh();
    showToast("Habit added");
  });

  $("categoryAddForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = $("categoryName");
    const name = input.value.trim();
    if (!name) return;
    try {
      await api("/api/categories", { method: "POST", body: JSON.stringify({ name }) });
      input.value = "";
      await refresh();
      showToast("Category added");
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

  $("quickAdd").addEventListener("click", () => {
    $("habitName").scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => $("habitName").focus(), 280);
  });
}

async function boot() {
  state.currentJ = jalaliFromDate(new Date());
  bindEvents();
  await refresh();
}

boot().catch(error => showToast(error.message));
