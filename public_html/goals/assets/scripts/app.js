// SMART Goals — vanilla JS, persisted through the MySQL state service.
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

const KEY = "edi_goals_v1";
const SMART_STEPS = ["specific", "measurable", "achievable", "relevant", "timebound"];
const STEP_LABELS = {
  specific: "Specific",
  measurable: "Measurable",
  achievable: "Achievable",
  relevant: "Relevant",
  timebound: "Time-bound",
};

let state = {
  goals: [],
  filters: { category: "", status: "" },
  wizard: {
    step: 0,
    draftId: null,           // null = new, else editing existing
    draftTasks: [],          // pending tasks while in wizard
    editGoalId: null,        // when "Edit SMART" from detail
  },
  detailId: null,
};

// ── Storage ──────────────────────────────────────────────────────────────────
function load() {
  try {
    const raw = appStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.goals)) state.goals = parsed.goals;
    }
  } catch (e) {
    console.error("Failed to load goals:", e);
    showToast("Couldn't read saved goals", "error");
  }
}

function save() {
  try {
    appStorage.setItem(KEY, JSON.stringify({ goals: state.goals }));
  } catch (e) {
    console.error("Failed to save goals:", e);
    showToast("Unable to save goals", "error");
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function uid() {
  return crypto.randomUUID();
}

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function daysUntil(iso) {
  if (!iso) return null;
  const target = new Date(iso + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.round((target - now) / (1000 * 60 * 60 * 24));
  return diff;
}

function formatDate(iso) {
  if (!iso) return "No deadline";
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function escapeHtml(s) {
  if (s == null) return "";
  const div = document.createElement("div");
  div.textContent = String(s);
  return div.innerHTML;
}

function calcProgress(goal) {
  const total = goal.tasks.length;
  if (!total) return 0;
  const done = goal.tasks.filter((t) => t.done).length;
  return Math.round((done / total) * 100);
}

function isCompleted(goal) {
  return goal.tasks.length > 0 && goal.tasks.every((t) => t.done);
}

function effectiveStatus(goal) {
  if (goal.status === "archived") return "archived";
  if (isCompleted(goal)) return "completed";
  return "active";
}

function deadlineClass(goal) {
  if (effectiveStatus(goal) !== "active") return "";
  const d = daysUntil(goal.deadline);
  if (d == null) return "";
  if (d < 0) return "overdue";
  if (d <= 7) return "soon";
  return "";
}

function deadlineText(goal) {
  if (!goal.deadline) return "No deadline";
  const d = daysUntil(goal.deadline);
  if (d == null) return formatDate(goal.deadline);
  if (d < 0) return `${Math.abs(d)}d overdue · ${formatDate(goal.deadline)}`;
  if (d === 0) return `Due today`;
  if (d === 1) return `Due tomorrow`;
  return `${d}d left · ${formatDate(goal.deadline)}`;
}

// ── Theme ────────────────────────────────────────────────────────────────────
function applyTheme() {
  try {
    const t = appStorage.getItem("edi_goals_theme") ||
      (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    document.documentElement.dataset.theme = t;
  } catch (e) {
    document.documentElement.dataset.theme = "dark";
  }
}

// ── Rendering ────────────────────────────────────────────────────────────────
function uniqueCategories() {
  const set = new Set();
  state.goals.forEach((g) => { if (g.category) set.add(g.category); });
  return [...set].sort((a, b) => a.localeCompare(b));
}

function renderCategoryFilter() {
  const sel = $("categoryFilter");
  const current = state.filters.category;
  const cats = uniqueCategories();
  sel.innerHTML = `<option value="">All categories</option>` +
    cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  sel.value = current;
}

function renderStats() {
  const row = $("statsRow");
  const total = state.goals.length;
  const active = state.goals.filter((g) => effectiveStatus(g) === "active").length;
  const completed = state.goals.filter((g) => effectiveStatus(g) === "completed").length;
  const avgProgress = (() => {
    const measurable = state.goals.filter((g) => g.tasks.length > 0);
    if (!measurable.length) return 0;
    return Math.round(measurable.reduce((n, g) => n + calcProgress(g), 0) / measurable.length);
  })();

  row.innerHTML = `
    <div class="stat-card"><div class="label">Total goals</div><div class="value">${total}</div></div>
    <div class="stat-card"><div class="label">Active</div><div class="value accent">${active}</div></div>
    <div class="stat-card"><div class="label">Completed</div><div class="value">${completed}</div></div>
    <div class="stat-card"><div class="label">Avg progress</div><div class="value ${avgProgress >= 75 ? "accent" : avgProgress < 25 ? "warn" : ""}">${avgProgress}%</div></div>
  `;
}

function renderGoals() {
  const main = $("goalsMain");
  const empty = $("emptyState");
  const { category, status } = state.filters;
  const list = state.goals.filter((g) => {
    if (category && g.category !== category) return false;
    if (status && effectiveStatus(g) !== status) return false;
    return true;
  });

  if (!state.goals.length) {
    main.innerHTML = "";
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  if (!list.length) {
    main.innerHTML = `<p class="empty-state">No goals match these filters.</p>`;
    return;
  }

  main.innerHTML = list
    .map((g) => goalCardHTML(g))
    .join("");

  // bind clicks
  main.querySelectorAll(".goal-card").forEach((el) => {
    el.addEventListener("click", () => openDetail(el.dataset.id));
  });
}

function goalCardHTML(g) {
  const status = effectiveStatus(g);
  const progress = calcProgress(g);
  const completedCount = g.tasks.filter((t) => t.done).length;
  return `
    <article class="goal-card ${status}" data-id="${g.id}">
      <div class="top-row">
        ${g.category ? `<span class="category-pill">${escapeHtml(g.category)}</span>` : `<span></span>`}
        <div style="display:flex;gap:8px;align-items:center;">
          <span class="status-tag ${status}">${status}</span>
          <span class="priority-dot ${g.priority || "medium"}" title="${g.priority || "medium"} priority"></span>
        </div>
      </div>
      <h3>${escapeHtml(g.title || "Untitled goal")}</h3>
      ${g.specific ? `<p class="desc">${escapeHtml(g.specific)}</p>` : ""}
      <div class="progress-row">
        <span>${progress}% · ${completedCount}/${g.tasks.length} tasks</span>
        <span>${progress >= 100 ? "✓ done" : progress + "%"}</span>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div>
      <div class="footer-row">
        <span class="deadline ${deadlineClass(g)}">${deadlineText(g)}</span>
        ${g.metric ? `<span>${escapeHtml(g.metric)}${g.target ? `: ${g.target}${g.unit ? " " + escapeHtml(g.unit) : ""}` : ""}</span>` : ""}
      </div>
    </article>
  `;
}

function render() {
  renderCategoryFilter();
  renderStats();
  renderGoals();
}

// ── Wizard ───────────────────────────────────────────────────────────────────
function openWizard(editGoalId = null) {
  state.wizard = {
    step: 0,
    draftId: editGoalId,
    draftTasks: [],
    editGoalId,
  };

  const form = $("wizardForm");
  form.reset();
  $("goalId").value = editGoalId || "";
  $("wizardEyebrow").textContent = editGoalId ? "Edit Goal" : "New Goal";
  $("wizardTitle").textContent = editGoalId ? "Refine this SMART goal" : "Define a SMART goal";

  if (editGoalId) {
    const g = state.goals.find((x) => x.id === editGoalId);
    if (g) {
      $("gTitle").value = g.title || "";
      $("gSpecific").value = g.specific || "";
      $("gCategory").value = g.category || "";
      $("gMetric").value = g.metric || "";
      $("gTarget").value = g.target ?? "";
      $("gUnit").value = g.unit || "";
      $("gRelevant").value = g.relevant || "";
      $("gPriority").value = g.priority || "medium";
      $("gDeadline").value = g.deadline || "";
      $("gStart").value = g.startDate || "";
      state.wizard.draftTasks = g.tasks.map((t) => ({ ...t }));
    }
  } else {
    // sensible default start date
    $("gStart").value = todayISO();
  }

  renderCategoryDatalist();
  renderWizardTasks();
  clearWizardError();
  showWizardStep(0);
  $("wizardModal").showModal();
  setTimeout(() => $("gTitle").focus(), 60);
}

function closeWizard() {
  $("wizardModal").close();
  state.wizard = { step: 0, draftId: null, draftTasks: [], editGoalId: null };
}

function renderCategoryDatalist() {
  const list = $("categoryList");
  list.innerHTML = uniqueCategories()
    .map((c) => `<option value="${escapeHtml(c)}">`)
    .join("");
}

function renderWizardTasks() {
  const ul = $("taskPreview");
  if (!state.wizard.draftTasks.length) {
    ul.innerHTML = `<li style="color:var(--text-tertiary);font-size:13px;justify-content:center;">No tasks yet. Add at least one to make this goal actionable.</li>`;
    return;
  }
  ul.innerHTML = state.wizard.draftTasks
    .map(
      (t, i) => `
      <li>
        <span>${escapeHtml(t.title)}</span>
        <button type="button" data-i="${i}" aria-label="Remove">×</button>
      </li>
    `
    )
    .join("");
  ul.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => {
      const i = Number(b.dataset.i);
      state.wizard.draftTasks.splice(i, 1);
      renderWizardTasks();
    });
  });
}

function addWizardTask() {
  const input = $("taskTitle");
  const title = input.value.trim();
  if (!title) return;
  state.wizard.draftTasks.push({ id: uid(), title, done: false });
  input.value = "";
  clearWizardError();
  renderWizardTasks();
  input.focus();
}

function showWizardStep(step) {
  state.wizard.step = step;
  $$(".wizard-panel").forEach((p) => {
    p.hidden = p.dataset.panel !== SMART_STEPS[step];
  });
  $$(".wizard-steps li").forEach((li) => {
    if (li.dataset.step === SMART_STEPS[step]) {
      li.setAttribute("aria-current", "step");
    } else {
      li.removeAttribute("aria-current");
    }
  });
  $("wizardProgress").textContent = `Step ${step + 1} of ${SMART_STEPS.length} · ${STEP_LABELS[SMART_STEPS[step]]}`;
  $("prevStepBtn").hidden = step === 0;
  const isLast = step === SMART_STEPS.length - 1;
  $("nextStepBtn").hidden = isLast;
  $("wizardSubmit").hidden = !isLast;
  clearWizardError();
}

function setWizardError(message) {
  const el = $("wizardError");
  el.textContent = message;
  el.hidden = false;
}

function clearWizardError() {
  const el = $("wizardError");
  if (!el) return;
  el.textContent = "";
  el.hidden = true;
}

function wizardStepValid(step) {
  if (step === 0) return $("gTitle").value.trim().length > 0;
  if (step === 2) return state.wizard.draftTasks.length > 0;
  return true;
}

function nextStep() {
  if (!wizardStepValid(state.wizard.step)) {
    if (state.wizard.step === 0) setWizardError("Give your goal a title before continuing.");
    else if (state.wizard.step === 2) setWizardError("Add at least one task before continuing.");
    return;
  }
  showWizardStep(Math.min(state.wizard.step + 1, SMART_STEPS.length - 1));
}

function prevStep() {
  showWizardStep(Math.max(state.wizard.step - 1, 0));
}

function handleWizardSubmit(e) {
  e.preventDefault();
  // Final validation
  if (!$("gTitle").value.trim()) {
    showWizardStep(0);
    setWizardError("Give your goal a title before saving.");
    $("gTitle").focus();
    return;
  }
  if (!state.wizard.draftTasks.length) {
    showWizardStep(2);
    setWizardError("Add at least one task before saving.");
    return;
  }

  const id = $("goalId").value || uid();
  const existing = state.goals.find((g) => g.id === id);
  const data = {
    id,
    title: $("gTitle").value.trim(),
    specific: $("gSpecific").value.trim(),
    category: $("gCategory").value.trim(),
    metric: $("gMetric").value.trim(),
    target: $("gTarget").value !== "" ? Number($("gTarget").value) : null,
    unit: $("gUnit").value.trim(),
    relevant: $("gRelevant").value.trim(),
    priority: $("gPriority").value,
    deadline: $("gDeadline").value || null,
    startDate: $("gStart").value || null,
    notes: existing?.notes || "",
    status: existing?.status || "active",
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),
    tasks: state.wizard.draftTasks.map((t) => ({ ...t })),
  };

  if (existing) {
    Object.assign(existing, data);
    showToast("Goal updated", "success");
  } else {
    state.goals.push(data);
    showToast("Goal created", "success");
  }
  save();
  render();
  closeWizard();

  // If we opened from detail, refresh detail panel
  if (state.detailId === id) openDetail(id);
}

// ── Detail modal ─────────────────────────────────────────────────────────────
function openDetail(id) {
  const goal = state.goals.find((g) => g.id === id);
  if (!goal) return;
  state.detailId = id;
  $("detailCategory").textContent = goal.category || "Uncategorized";
  $("detailTitle").textContent = goal.title;
  renderDetailMeta(goal);
  renderSmartSummary(goal);
  renderDetailTasks(goal);
  renderDetailProgress(goal);
  $("goalNotes").value = goal.notes || "";
  $("detailModal").showModal();
}

function closeDetail() {
  $("detailModal").close();
  state.detailId = null;
}

function renderDetailMeta(g) {
  const status = effectiveStatus(g);
  $("detailMeta").innerHTML = `
    <span><strong>${status}</strong></span>
    <span>Priority: <strong>${g.priority || "medium"}</strong></span>
    <span>${g.startDate ? "Started " + formatDate(g.startDate) : ""}</span>
    <span>${g.deadline ? "Due " + formatDate(g.deadline) : "No deadline"}</span>
    ${g.metric ? `<span>Metric: <strong>${escapeHtml(g.metric)}${g.target != null ? " · " + g.target + (g.unit ? " " + escapeHtml(g.unit) : "") : ""}</strong></span>` : ""}
  `;
}

function renderSmartSummary(g) {
  const fields = [
    ["S · Specific", g.specific || g.title, true],
    ["M · Measurable", g.metric ? `${g.metric}${g.target != null ? " (target " + g.target + (g.unit ? " " + g.unit : "") + ")" : ""}` : null, true],
    ["A · Achievable", `${g.tasks.length} task${g.tasks.length === 1 ? "" : "s"} planned`, true],
    ["R · Relevant", g.relevant, true],
    ["T · Time-bound", g.deadline ? `Due ${formatDate(g.deadline)}` : "No deadline", true],
  ];
  $("smartSummary").innerHTML = fields
    .filter(([, v]) => v)
    .map(([k, v, full]) => `<dt class="${full ? "full" : ""}">${k}</dt><dd class="${full ? "full" : ""}">${escapeHtml(v)}</dd>`)
    .join("");
}

function renderDetailProgress(g) {
  const pct = calcProgress(g);
  const done = g.tasks.filter((t) => t.done).length;
  $("progressLabel").textContent = pct + "%";
  $("progressCount").textContent = `${done} / ${g.tasks.length} task${g.tasks.length === 1 ? "" : "s"} complete`;
  $("progressFill").style.width = pct + "%";
}

function renderDetailTasks(g) {
  const ul = $("tasksList");
  if (!g.tasks.length) {
    ul.innerHTML = `<li class="task-item" style="justify-content:center;color:var(--text-tertiary);">No tasks yet.</li>`;
    return;
  }
  ul.innerHTML = g.tasks
    .map(
      (t) => `
      <li class="task-item ${t.done ? "done" : ""}" data-id="${t.id}">
        <input type="checkbox" ${t.done ? "checked" : ""} aria-label="Mark complete">
        <span class="task-title">${escapeHtml(t.title)}</span>
        <button type="button" class="task-remove" aria-label="Remove">×</button>
      </li>
    `
    )
    .join("");

  ul.querySelectorAll(".task-item").forEach((li) => {
    const taskId = li.dataset.id;
    li.querySelector("input").addEventListener("change", (e) => {
      const task = g.tasks.find((t) => t.id === taskId);
      if (task) {
        task.done = e.target.checked;
        save();
        renderDetailTasks(g);
        renderDetailProgress(g);
        render();
      }
    });
    li.querySelector(".task-remove").addEventListener("click", () => {
      g.tasks = g.tasks.filter((t) => t.id !== taskId);
      save();
      renderDetailTasks(g);
      renderDetailProgress(g);
      render();
    });
  });
}

function bumpProgress() {
  const g = state.goals.find((x) => x.id === state.detailId);
  if (!g) return;
  const open = g.tasks.filter((t) => !t.done);
  if (!open.length) {
    showToast("All tasks complete — nice.", "success");
    return;
  }
  // Find longest open task, or first
  const next = open[0];
  if (confirm(`Mark "${next.title}" complete?`)) {
    next.done = true;
    save();
    renderDetailTasks(g);
    renderDetailProgress(g);
    render();
    showToast("Task complete", "success");
  }
}

function handleAddTask(e) {
  e.preventDefault();
  const g = state.goals.find((x) => x.id === state.detailId);
  if (!g) return;
  const title = $("newTaskInput").value.trim();
  if (!title) return;
  g.tasks.push({ id: uid(), title, done: false });
  save();
  $("newTaskInput").value = "";
  renderDetailTasks(g);
  renderDetailProgress(g);
  render();
  showToast("Task added", "success");
}

function handleGoalNotesInput() {
  const g = state.goals.find((x) => x.id === state.detailId);
  if (!g) return;
  g.notes = $("goalNotes").value;
  save();
}

function editCurrentGoal() {
  if (!state.detailId) return;
  closeDetail();
  openWizard(state.detailId);
}

function deleteCurrentGoal() {
  if (!state.detailId) return;
  const g = state.goals.find((x) => x.id === state.detailId);
  if (!g) return;
  if (!confirm(`Delete "${g.title}" and all its tasks?`)) return;
  state.goals = state.goals.filter((x) => x.id !== state.detailId);
  save();
  closeDetail();
  render();
  showToast("Goal deleted", "success");
}

// ── Toast ────────────────────────────────────────────────────────────────────
function showToast(message, type = "info") {
  const toast = $("toast");
  toast.textContent = message;
  toast.className = `toast ${type}`;
  void toast.offsetWidth;
  toast.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove("show"), 2400);
}

// ── Event wiring ─────────────────────────────────────────────────────────────
function setupEventListeners() {
  applyTheme();

  $("newGoalBtn").addEventListener("click", () => openWizard());

  $("closeWizard").addEventListener("click", closeWizard);
  $("wizardForm").addEventListener("submit", handleWizardSubmit);
  $("wizardForm").addEventListener("click", (e) => {
    if (e.target === $("wizardForm")) closeWizard();
  });
  $("wizardModal").addEventListener("click", (e) => {
    if (e.target === $("wizardModal")) closeWizard();
  });

  $("prevStepBtn").addEventListener("click", prevStep);
  $("nextStepBtn").addEventListener("click", nextStep);
  $("addTaskBtn").addEventListener("click", addWizardTask);
  $("taskTitle").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addWizardTask();
    }
  });
  $("gTitle").addEventListener("input", clearWizardError);

  // Allow Enter to advance in single-input panels
  $("wizardForm").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName !== "TEXTAREA" && e.target.id !== "taskTitle") {
      const submit = $("wizardSubmit");
      if (!submit.hidden) {
        e.preventDefault();
        handleWizardSubmit(e);
      } else {
        e.preventDefault();
        nextStep();
      }
    }
  });

  $("categoryFilter").addEventListener("change", (e) => {
    state.filters.category = e.target.value;
    renderGoals();
  });
  $("statusFilter").addEventListener("change", (e) => {
    state.filters.status = e.target.value;
    renderGoals();
  });

  // Detail modal
  $("closeDetail").addEventListener("click", closeDetail);
  $("detailModal").addEventListener("click", (e) => {
    if (e.target === $("detailModal")) closeDetail();
  });
  $("bumpProgressBtn").addEventListener("click", bumpProgress);
  $("editGoalBtn").addEventListener("click", editCurrentGoal);
  $("deleteGoalBtn").addEventListener("click", deleteCurrentGoal);
  $("addTaskForm").addEventListener("submit", handleAddTask);
  $("goalNotes").addEventListener("input", handleGoalNotesInput);

  // Escape closes dialogs
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if ($("wizardModal")?.open) closeWizard();
      else if ($("detailModal")?.open) closeDetail();
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  await window.appStorageReady;
  load();
  setupEventListeners();
  render();
});
