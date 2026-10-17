// SMART Goals — vanilla JS, persisted through the MySQL state service.
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

const KEY = "edi_goals_v1";
const DRAFTS_KEY = "edi_goals_drafts_v1";
const WIZARD_FIELDS = ["gTitle", "gSpecific", "gCategory",
  "gRelevant", "gPriority", "gDeadline", "gStart", "gProgressSource", "gHabit", "gHabitTarget"];
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
  wizardDrafts: {},
  filters: { category: "", status: "" },
  wizard: {
    step: 0,
    draftId: null,           // null = new, else editing existing
    draftTasks: [],          // pending tasks while in wizard
    editGoalId: null,        // when "Edit SMART" from detail
  },
  detailId: null,
};
let wizardDraftSaveTimer = null;
let habitContext = null;
const progressResult = goal => LifeGoalProgress.result(goal, habitContext);

// ── Storage ──────────────────────────────────────────────────────────────────
function load() {
  try {
    const raw = appStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Goals saved without a checklist would otherwise break rendering.
      if (Array.isArray(parsed.goals)) state.goals = parsed.goals.map(goal => ({...goal, tasks: Array.isArray(goal.tasks) ? goal.tasks : [], measures: goalMeasures(goal)}));
    }
    const drafts = appStorage.getItem(DRAFTS_KEY);
    if (drafts) {
      const parsedDrafts = JSON.parse(drafts);
      if (parsedDrafts && typeof parsedDrafts === "object" && !Array.isArray(parsedDrafts)) {
        state.wizardDrafts = parsedDrafts;
      }
    }
  } catch (e) {
    console.error("Failed to load goals:", e);
    showToast("Couldn't read saved goals", "error");
  }
}

function save() {
  try {
    appStorage.setItem(KEY, JSON.stringify({...JSON.parse(appStorage.getItem(KEY) || "{}"), goals: state.goals }));
  } catch (e) {
    console.error("Failed to save goals:", e);
    showToast("Unable to save goals", "error");
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function uid() {
  return crypto.randomUUID();
}

function goalMeasures(goal) {
  if (Array.isArray(goal.measures)) return goal.measures;
  return goal.metric || goal.target != null || goal.unit
    ? [{id: uid(), metric: goal.metric || '', target: goal.target ?? null, unit: goal.unit || '', current: goal.current ?? null}]
    : [];
}

function readWizardMeasures() {
  return [...$('wizardMeasures').querySelectorAll('.measure-editor')].map(row => ({
    id: row.dataset.id,
    metric: row.querySelector('[data-measure="metric"]').value.trim(),
    target: row.querySelector('[data-measure="target"]').value === '' ? null : Number(row.querySelector('[data-measure="target"]').value),
    unit: row.querySelector('[data-measure="unit"]').value.trim(),
    current: row.querySelector('[data-measure="current"]').value === '' ? null : Number(row.querySelector('[data-measure="current"]').value),
  }));
}

function renderWizardMeasures() {
  const container = $('wizardMeasures');
  container.replaceChildren();
  state.wizard.measures.forEach((measure, index) => {
    const row = document.createElement('div');
    row.className = 'measure-editor';
    row.dataset.id = measure.id || uid();
    row.innerHTML = `<div class="measure-heading"><strong>Measure ${index + 1}</strong><button type="button" class="icon-btn" aria-label="Remove measure ${index + 1}">×</button></div><label class="field"><span>Success measure</span><input class="input" data-measure="metric" maxlength="120" placeholder="e.g. Books read"></label><div class="measure-values"><label class="field"><span>Current value</span><input class="input" data-measure="current" type="number" step="any" min="0" placeholder="Not recorded"></label><label class="field"><span>Target value</span><input class="input" data-measure="target" type="number" step="any" min="0" placeholder="e.g. 12"></label><label class="field"><span>Unit</span><input class="input" data-measure="unit" maxlength="20" placeholder="e.g. books"></label></div>`;
    for (const key of ['metric', 'target', 'unit', 'current']) row.querySelector(`[data-measure="${key}"]`).value = measure[key] ?? '';
    row.querySelector('button').addEventListener('click', () => {
      state.wizard.measures = readWizardMeasures().filter(item => item.id !== row.dataset.id);
      renderWizardMeasures(); persistWizardDraft();
    });
    container.append(row);
  });
}

function renderDetailMeasures(goal) {
  const container = $('detailMeasures');
  container.replaceChildren();
  const measures = goal.progressSource === "habit" ? [] : goalMeasures(goal);
  container.hidden = !measures.length;
  if (!measures.length) return;
  const heading = document.createElement('h4'); heading.textContent = 'Success measures'; container.append(heading);
  measures.forEach((measure, index) => {
    const row = document.createElement('div'); row.className = 'measure-result';
    const description = document.createElement('div');
    const name = document.createElement('strong'); name.textContent = measure.metric || `Measure ${index + 1}`;
    const target = document.createElement('small'); target.textContent = measure.target != null ? `Target: ${measure.target}${measure.unit ? ' ' + measure.unit : ''}` : 'No numeric target';
    description.append(name, target);
    const label = document.createElement('label'); label.className = 'field';
    const title = document.createElement('span'); title.textContent = 'Current value';
    const input = document.createElement('input'); input.className = 'input'; input.type = 'number'; input.min = '0'; input.step = 'any'; input.placeholder = 'Not recorded'; input.value = measure.current ?? '';
    input.setAttribute('aria-label', `Current value for ${measure.metric || 'measure ' + (index + 1)}`);
    input.addEventListener('change', () => {
      if (!input.checkValidity()) { input.reportValidity(); return; }
      measures[index].current = input.value === '' ? null : Number(input.value);
      goal.measures = measures;
      goal.updatedAt = Date.now(); save(); render(); renderDetailProgress(goal); renderDetailMeta(goal);
    });
    label.append(title, input); row.append(description, label); container.append(row);
  });
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

const escapeHtml = globalThis.lifeOsHtml.escapeHtml;

function calcProgress(goal) { return progressResult(goal).pct; }
function isCompleted(goal) { return progressResult(goal).pct === 100; }
function updateProgressFields() {
  const linked=$('gProgressSource').value==='habit';
  $('habitProgressFields').hidden=!linked;
  $('wizardMeasures').hidden=linked; $('addMeasureBtn').hidden=linked;
  $('habitPlanHelp').hidden=!linked;
  document.querySelector('[data-panel="achievable"] .wizard-help').hidden=linked;
  document.querySelector('.task-editor').hidden=linked; $('taskPreview').hidden=linked;
}
function progressCaption(g) {
  const p=progressResult(g);
  return p.pct===null ? 'Habit progress unavailable' : p.source==='measure' ? 'Success measures' : `${p.done} / ${p.total} ${p.unit} complete`;
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
    const measurable = state.goals.filter((g) => (g.tasks.length > 0 || progressResult(g).source !== 'checklist') && calcProgress(g)!==null);
    if (!measurable.length) return 0;
    return Math.round(measurable.reduce((n, g) => n + (calcProgress(g) ?? 0), 0) / measurable.length);
  })();

  row.innerHTML = `
    <div class="stat-card stat-total"><span class="stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="m15 9 5-5m0 0v4m0-4h-4"/></svg></span><div><div class="label">Total goals</div><div class="value">${total}</div></div></div>
    <div class="stat-card stat-active"><span class="stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M13 2 4.5 13h7L11 22l8.5-12h-7L13 2Z"/></svg></span><div><div class="label">Active</div><div class="value accent">${active}</div></div></div>
    <div class="stat-card stat-completed"><span class="stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></span><div><div class="label">Completed</div><div class="value">${completed}</div></div></div>
    <div class="stat-card stat-progress"><span class="stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 19V9m6 10V5m6 14v-7m4 7H2"/></svg></span><div><div class="label">Avg progress</div><div class="value ${avgProgress >= 75 ? "accent" : avgProgress < 25 ? "warn" : ""}">${avgProgress}%</div></div></div>
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
  $('goalListCount').textContent = `${list.length} goal${list.length === 1 ? '' : 's'}`;

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
    .map((g, index) => goalCardHTML(g, index))
    .join("");

  // bind clicks
  main.querySelectorAll(".goal-card").forEach((el) => {
    el.addEventListener("click", () => openDetail(el.dataset.id));
    el.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault(); openDetail(el.dataset.id);
      }
    });
  });
}

// Compact card: title, progress and when it's due. Everything else lives in the goal's detail view.
function goalCardHTML(g, index = 0) {
  const status = effectiveStatus(g);
  const progress = calcProgress(g);
  const priority = ['low', 'medium', 'high'].includes(g.priority) ? g.priority : 'medium';
  const when = status === 'completed' ? '✓ Completed' : status === 'archived' ? 'Archived' : deadlineText(g);
  return `
    <article class="goal-card ${status}" data-id="${g.id}" tabindex="0" role="button" aria-label="Open goal: ${escapeHtml(g.title || 'Untitled goal').replace(/"/g, '&quot;')}">
      <div class="goal-card-heading"><span class="priority-dot ${priority}" title="${priority} priority" aria-label="${priority} priority"></span><h3 dir="auto">${escapeHtml(g.title || "Untitled goal")}</h3></div>
      <div class="progress-track" role="progressbar" aria-label="Goal progress" aria-valuemin="0" aria-valuemax="100" ${progress===null ? 'aria-valuetext="Unavailable"' : `aria-valuenow="${progress}"`}><div class="progress-fill" style="width:${progress ?? 0}%"></div></div>
      <div class="footer-row">
        <span class="deadline ${deadlineClass(g)}">${escapeHtml(when)}</span>
        <strong class="goal-card-pct">${progress ?? '—'}${progress === null ? '' : '%'}</strong>
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
  const draftKey = editGoalId || "new";
  const savedDraft = state.wizardDrafts[draftKey];
  state.wizard = {
    step: savedDraft?.step ?? 0,
    draftId: editGoalId,
    draftTasks: savedDraft?.tasks?.map((task) => ({ ...task })) || [],
    measures: savedDraft?.measures?.map(measure => ({...measure})) || (savedDraft ? goalMeasures({metric: savedDraft.fields?.gMetric, target: savedDraft.fields?.gTarget === '' ? null : savedDraft.fields?.gTarget, unit: savedDraft.fields?.gUnit}) : []),
    editGoalId,
    draftKey,
  };

  const form = $("wizardForm");
  form.reset();
  $('gHabit').replaceChildren();
  const placeholder=new Option(habitContext ? 'Choose a habit' : 'Habits unavailable — refresh to retry', ''); $('gHabit').add(placeholder);
  for(const h of habitContext?.habits || []) $('gHabit').add(new Option(h.name,String(h.id)));
  const linked=state.goals.find(g=>g.id===editGoalId)?.habitProgress;
  if(linked && ![...$('gHabit').options].some(o=>o.value===String(linked.habitId))) $('gHabit').add(new Option((linked.habitName||'Habit')+' (archived)',String(linked.habitId)));
  $("goalId").value = editGoalId || "";
  $("wizardEyebrow").textContent = editGoalId ? "Edit Goal" : "New Goal";
  $("wizardTitle").textContent = editGoalId ? "Refine this SMART goal" : "Define a SMART goal";

  if (savedDraft) {
    for (const field of WIZARD_FIELDS) {
      if (Object.hasOwn(savedDraft.fields || {}, field)) $(field).value = savedDraft.fields[field];
    }
  } else if (editGoalId) {
    const g = state.goals.find((x) => x.id === editGoalId);
    if (g) {
      $('gProgressSource').value=LifeGoalProgress.source(g);
      $('gHabit').value=g.habitProgress?.habitId||'';
      $('gHabitTarget').value=g.habitProgress?.targetDays||24;
      $("gTitle").value = g.title || "";
      $("gSpecific").value = g.specific || "";
      $("gCategory").value = g.category || "";
      state.wizard.measures = goalMeasures(g).map(measure => ({...measure}));
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

  if (!state.wizard.measures.length) state.wizard.measures.push({id: uid(), metric: '', target: null, unit: '', current: null});
  renderWizardMeasures();
  updateProgressFields();
  renderCategoryDatalist();
  renderWizardTasks();
  clearWizardError();
  showWizardStep(state.wizard.step);
  $("wizardModal").showModal();
  setTimeout(() => $("gTitle").focus(), 60);
}

function persistWizardDraft() {
  if (!state.wizard.draftKey) return;
  state.wizardDrafts[state.wizard.draftKey] = {
    step: state.wizard.step,
    fields: Object.fromEntries(WIZARD_FIELDS.map((field) => [field, $(field).value])),
    tasks: state.wizard.draftTasks.map((task) => ({ ...task })),
    measures: readWizardMeasures(),
  };
  clearTimeout(wizardDraftSaveTimer);
  wizardDraftSaveTimer = setTimeout(() => {
    wizardDraftSaveTimer = null;
    appStorage.setItem(DRAFTS_KEY, JSON.stringify(state.wizardDrafts));
  }, 250);
}

function closeWizard({ preserve = true } = {}) {
  if (preserve) {
    persistWizardDraft();
    clearTimeout(wizardDraftSaveTimer);
    wizardDraftSaveTimer = null;
    appStorage.setItem(DRAFTS_KEY, JSON.stringify(state.wizardDrafts));
  }
  $("wizardModal").close();
}

function renderCategoryDatalist() {
  const list = $("categoryList");
  list.innerHTML = uniqueCategories()
    .map((c) => `<option value="${escapeHtml(c)}">`)
    .join("");
}

function enableTaskDrag(list, tasks, onReorder) {
  let from = null;
  const clearDropMarks = () => {
    list.querySelectorAll(".drop-before, .drop-after").forEach((row) => {
      row.classList.remove("drop-before", "drop-after");
    });
  };
  list.querySelectorAll("[data-drag-index]").forEach((handle) => {
    handle.addEventListener("dragstart", (event) => {
      from = Number(handle.dataset.dragIndex);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(from));
    });
    handle.addEventListener("dragend", () => {
      from = null;
      clearDropMarks();
    });
  });
  list.querySelectorAll("[data-task-index]").forEach((row) => {
    row.addEventListener("dragover", (event) => {
      if (from === null) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      clearDropMarks();
      const before = event.clientY < row.getBoundingClientRect().top + row.offsetHeight / 2;
      row.classList.add(before ? "drop-before" : "drop-after");
    });
    row.addEventListener("drop", (event) => {
      if (from === null) return;
      event.preventDefault();
      const target = Number(row.dataset.taskIndex);
      const before = event.clientY < row.getBoundingClientRect().top + row.offsetHeight / 2;
      let to = target + (before ? 0 : 1);
      if (from < to) to--;
      clearDropMarks();
      if (from !== to) {
        tasks.splice(to, 0, tasks.splice(from, 1)[0]);
        onReorder();
      }
      from = null;
    });
  });
}

function renderWizardTasks() {
  const ul = $("taskPreview");
  if ($('gProgressSource').value==='checklist' && !state.wizard.draftTasks.length) {
    ul.innerHTML = `<li style="color:var(--text-tertiary);font-size:13px;justify-content:center;">No tasks yet. Add at least one to make this goal actionable.</li>`;
    return;
  }
  ul.innerHTML = state.wizard.draftTasks
    .map(
      (t, i) => `
      <li data-task-index="${i}">
        <button type="button" class="task-drag" draggable="true" data-drag-index="${i}" aria-label="Drag checklist item ${i + 1} to reorder" title="Drag to reorder">⠿</button>
        <input class="input task-edit-input" data-i="${i}" aria-label="Checklist item ${i + 1}" maxlength="150" value="${escapeHtml(t.title)}">
        <span class="task-order-actions">
          <button type="button" data-action="up" data-i="${i}" aria-label="Move item up" ${i === 0 ? "disabled" : ""}>↑</button>
          <button type="button" data-action="down" data-i="${i}" aria-label="Move item down" ${i === state.wizard.draftTasks.length - 1 ? "disabled" : ""}>↓</button>
          <button type="button" data-action="remove" data-i="${i}" aria-label="Remove item">×</button>
        </span>
      </li>
    `
    )
    .join("");
  ul.querySelectorAll(".task-edit-input").forEach((input) => {
    input.addEventListener("input", () => {
      state.wizard.draftTasks[Number(input.dataset.i)].title = input.value;
      persistWizardDraft();
    });
  });
  ul.querySelectorAll("[data-action]").forEach((b) => {
    b.addEventListener("click", () => {
      const i = Number(b.dataset.i);
      const action = b.dataset.action;
      if (action === "remove") state.wizard.draftTasks.splice(i, 1);
      else {
        const destination = action === "up" ? i - 1 : i + 1;
        [state.wizard.draftTasks[i], state.wizard.draftTasks[destination]] =
          [state.wizard.draftTasks[destination], state.wizard.draftTasks[i]];
      }
      renderWizardTasks();
      persistWizardDraft();
    });
  });
  enableTaskDrag(ul, state.wizard.draftTasks, () => {
    renderWizardTasks();
    persistWizardDraft();
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
  persistWizardDraft();
  input.focus();
}

function showWizardStep(step) {
  const previousStep = state.wizard.step;
  state.wizard.step = step;
  $$(".wizard-panel").forEach((p) => {
    p.hidden = p.dataset.panel !== SMART_STEPS[step];
    p.classList.toggle("step-forward", step >= previousStep && !p.hidden);
    p.classList.toggle("step-back", step < previousStep && !p.hidden);
  });
  $$(".wizard-steps li").forEach((li, index) => {
    li.classList.toggle("is-complete", index < step);
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
  persistWizardDraft();
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
  if (step === 1 && $('gProgressSource').value==='habit') return !!$('gHabit').value && $('gHabitTarget').checkValidity() && Number($('gHabitTarget').value)>0;
  if (step === 1 && $('gProgressSource').value==='measure' && !readWizardMeasures().some(m=>Number(m.target)>0)) return false;
  if (step === 1) return [...$('wizardMeasures').querySelectorAll('input')].every(input => input.checkValidity()) && readWizardMeasures().every(measure => measure.metric || (measure.target == null && measure.current == null && !measure.unit));
  if (step === 2) return $('gProgressSource').value!=='checklist' || state.wizard.draftTasks.length > 0;
  return true;
}

function nextStep() {
  if (!wizardStepValid(state.wizard.step)) {
    if (state.wizard.step === 0) setWizardError("Give your goal a title before continuing.");
    else if (state.wizard.step === 1) setWizardError("Choose a habit and whole-day target, or name each measure and use valid numbers.");
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
  if ($('gProgressSource').value==='checklist' && !state.wizard.draftTasks.length) {
    showWizardStep(2);
    setWizardError("Add at least one task before saving.");
    return;
  }

  if($('gProgressSource').value==='habit' && (!$('gStart').value || !$('gDeadline').value || $('gStart').value>$('gDeadline').value || Number($('gHabitTarget').value)>(new Date($('gDeadline').value)-new Date($('gStart').value))/86400000+1)) {
    showWizardStep(4); setWizardError('Choose a valid date window with enough days for your target.'); return;
  }
  const id = $("goalId").value || uid();
  if (!wizardStepValid(1)) {
    showWizardStep(1);
    setWizardError('Choose a habit and whole-day target, or name each measure and use valid numbers.');
    return;
  }
  const measures = readWizardMeasures().filter(measure => measure.metric);
  const existing = state.goals.find((g) => g.id === id);
  const data = {
    id,
    progressSource: $('gProgressSource').value,
    habitProgress: $('gProgressSource').value==='habit' ? {habitId:$('gHabit').value,habitName:$('gHabit').selectedOptions[0].textContent,targetDays:Number($('gHabitTarget').value)} : null,
    title: $("gTitle").value.trim(),
    specific: $("gSpecific").value.trim(),
    category: $("gCategory").value.trim(),
    measures,
    metric: measures[0]?.metric || '',
    target: measures[0]?.target ?? null,
    unit: measures[0]?.unit || '',
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
  LifeGoalProgress.load(state.goals,true).then(context=>{habitContext=context;render();}).catch(()=>{habitContext=null;render();});
  render();
  delete state.wizardDrafts[state.wizard.draftKey];
  clearTimeout(wizardDraftSaveTimer);
  wizardDraftSaveTimer = null;
  appStorage.setItem(DRAFTS_KEY, JSON.stringify(state.wizardDrafts));
  closeWizard({ preserve: false });

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
  renderDetailMeasures(goal);
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
    ${goalMeasures(g).length ? `<span><strong>${goalMeasures(g).length} success measure${goalMeasures(g).length === 1 ? '' : 's'}</strong></span>` : ''}
  `;
}

function renderSmartSummary(g) {
  const fields = [
    ["S · Specific", g.specific || g.title, true],
    ["M · Measurable", goalMeasures(g).map(measure => `${measure.metric}${measure.target != null ? ' (target ' + measure.target + (measure.unit ? ' ' + measure.unit : '') + ')' : ''}`).join(' · ') || null, true],
    ["A · Achievable", g.progressSource === "habit" ? (g.habitProgress?.habitName || "Daily habit") : `${g.tasks.length} task${g.tasks.length === 1 ? "" : "s"} planned`, true],
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
  $("progressLabel").textContent = pct === null ? "—" : pct + "%";
  $("progressCount").textContent = progressCaption(g);
  $('bumpProgressBtn').hidden=progressResult(g).source!=='checklist';
  $('detailTaskSection').hidden=g.progressSource==='habit';
  const p=progressResult(g); $('habitMilestones').hidden=p.source!=='habit';
  $('habitMilestones').innerHTML=p.source==='habit' ? `<a href="/habittify/">Open Habittify ↗</a><div>${[...new Set([.25,.5,.75,1].map(n=>Math.ceil(p.total*n)))].map(n=>`<span class="${p.done!==null && p.done>=n?'reached':''}">${p.done!==null && p.done>=n?'✓ ':''}${n} days</span>`).join('')}</div>` : '';
  $("progressFill").style.width = (pct ?? 0) + "%";
}

function renderDetailTasks(g) {
  const ul = $("tasksList");
  if (!g.tasks.length) {
    ul.innerHTML = `<li class="task-item" style="justify-content:center;color:var(--text-tertiary);">No tasks yet.</li>`;
    return;
  }
  ul.innerHTML = g.tasks
    .map(
      (t, i) => `
      <li class="task-item ${t.done ? "done" : ""}" data-id="${t.id}" data-task-index="${i}">
        <button type="button" class="task-drag" draggable="true" data-drag-index="${i}" aria-label="Drag checklist item ${i + 1} to reorder" title="Drag to reorder">⠿</button>
        <input type="checkbox" ${t.done ? "checked" : ""} aria-label="Mark complete">
        <span class="task-title"><button type="button" class="task-title-edit" aria-label="Edit checklist item ${i + 1}">${escapeHtml(t.title)}</button></span>
        <span class="task-order-actions">
          <button type="button" data-move="-1" aria-label="Move checklist item ${i + 1} up" ${i === 0 ? "disabled" : ""}>↑</button>
          <button type="button" data-move="1" aria-label="Move checklist item ${i + 1} down" ${i === g.tasks.length - 1 ? "disabled" : ""}>↓</button>
        </span>
        <button type="button" class="task-remove" aria-label="Remove">×</button>
      </li>
    `
    )
    .join("");

  ul.querySelectorAll(".task-item").forEach((li) => {
    const taskId = li.dataset.id;
    li.querySelector(".task-title-edit").addEventListener("click", () => editDetailTask(g, taskId, li));
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
    li.querySelectorAll("[data-move]").forEach((button) => {
      button.addEventListener("click", () => {
        const from = Number(li.dataset.taskIndex);
        const to = from + Number(button.dataset.move);
        if (to < 0 || to >= g.tasks.length) return;
        [g.tasks[from], g.tasks[to]] = [g.tasks[to], g.tasks[from]];
        save();
        renderDetailTasks(g);
      });
    });
  });
  enableTaskDrag(ul, g.tasks, () => {
    save();
    renderDetailTasks(g);
  });
}

function editDetailTask(g, taskId, row) {
  const task = g.tasks.find((item) => item.id === taskId);
  if (!task) return;
  const title = row.querySelector(".task-title");
  const input = document.createElement("input");
  input.className = "input task-edit-input";
  input.value = task.title;
  input.maxLength = 150;
  input.setAttribute("aria-label", "Task title");
  const actions = document.createElement("span");
  actions.className = "task-edit-actions";
  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.textContent = "Save";
  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel";
  actions.append(saveButton, cancelButton);
  title.replaceChildren(input, actions);
  row.classList.add("editing");
  const finish = (commit) => {
    if (!row.isConnected) return;
    const value = input.value.trim();
    if (commit && !value) {
      input.setCustomValidity("Enter a task title.");
      input.reportValidity();
      input.focus();
      return;
    }
    if (commit && task.title !== value) {
      task.title = value;
      save();
      render();
    }
    renderDetailTasks(g);
    $("tasksList").querySelectorAll(".task-item").forEach((item) => {
      if (item.dataset.id === taskId) item.querySelector(".task-title-edit")?.focus();
    });
  };
  input.addEventListener("input", () => input.setCustomValidity(""));
  input.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (event.key === "Enter" || event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      finish(event.key === "Enter");
    }
  });
  saveButton.addEventListener("click", () => finish(true));
  cancelButton.addEventListener("click", () => finish(false));
  input.focus();
  input.select();
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
  const goalId = state.detailId;
  closeDetail();
  openWizard(goalId);
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
  $("gProgressSource").addEventListener("change", updateProgressFields);

  $("newGoalBtn").addEventListener("click", () => openWizard());
  $('addMeasureBtn').addEventListener('click', () => {
    state.wizard.measures = readWizardMeasures();
    state.wizard.measures.push({id: uid(), metric: '', target: null, unit: '', current: null});
    renderWizardMeasures(); persistWizardDraft();
    $('wizardMeasures').lastElementChild.querySelector('input').focus();
  });

  $("closeWizard").addEventListener("click", closeWizard);
  $("wizardForm").addEventListener("submit", handleWizardSubmit);
  $("wizardForm").addEventListener("input", persistWizardDraft);
  $("wizardForm").addEventListener("change", persistWizardDraft);
  $("wizardForm").addEventListener("click", (e) => {
    if (e.target === $("wizardForm")) closeWizard();
  });
  $("wizardModal").addEventListener("click", (e) => {
    if (e.target === $("wizardModal")) closeWizard();
  });
  $("wizardModal").addEventListener("cancel", (e) => {
    e.preventDefault();
    closeWizard();
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
  try {habitContext=await LifeGoalProgress.load(state.goals,true);} catch(e) {showToast(e.message,'error');}
  setupEventListeners();
  async function refreshHabitProgress() {
    if($("wizardModal").open || document.activeElement === $("goalNotes")) return;
    try {await appStorage.sync(); load(); habitContext=await LifeGoalProgress.load(state.goals,true);} catch(e) {habitContext=null; showToast(e.message,'error');}
    render(); const g=state.goals.find(g=>g.id===state.detailId); if(g) {renderDetailProgress(g);renderDetailMeta(g);}
  }
  window.addEventListener('message',e=>{if(e.origin===location.origin && e.source===parent && e.data?.type==='goals-refresh')refreshHabitProgress();});
  window.addEventListener('focus',refreshHabitProgress);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshHabitProgress();});
  setInterval(()=>{if(!document.hidden)refreshHabitProgress();},60000);
  render();
  const requestedGoal = new URLSearchParams(location.search).get('goal');
  const linkedGoal = state.goals.find(goal => String(goal.id) === requestedGoal);
  if (linkedGoal) openDetail(linkedGoal.id);
});
