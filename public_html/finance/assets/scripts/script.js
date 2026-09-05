// ── DEFAULT DATA ──────────────────────────────────────────────────────────────
const DEFAULT_INCOMES = [];

const DEFAULT_CATEGORIES = [
  { id: "food", label: "🛒 Food & Drinks", target: 6000000 },
  { id: "family", label: "👨‍👩‍👧 Family", target: 5000000 },
  { id: "housing", label: "🏗️ Housing & Construction", target: 5000000 },
  { id: "work", label: "💼 Work & Growth", target: 2000000 },
  { id: "project", label: "💻 Project Expenses", target: 5000000 },
  { id: "saving", label: "💰 Saving & Investment", target: 2227196 },
  { id: "transport", label: "🚗 Transportation", target: 500000 },
  { id: "loans", label: "🏦 Loans & Debts", target: 5000000 },
  { id: "bills", label: "📡 Bills, Internet, VPN", target: 1000000 },
  { id: "clothing", label: "👕 Clothing", target: 1000000 },
  { id: "charity", label: "🕌 Charity & Donation", target: 500000 },
  { id: "health", label: "💊 Health & Beauty", target: 500000 },
];

// ── STATE ─────────────────────────────────────────────────────────────────────
let state = {
  incomes: [],
  expenses: [], // { id, categoryId, desc, amount, date }
  categories: [], // { id, label, target }
};
let periods = {};
let activePeriod = "Current";

const PERIODS_STORAGE_KEY = "daramd_periods_v1";
const ACTIVE_PERIOD_KEY = "daramd_active_period_v1";

function freshState() {
  return {
    incomes: DEFAULT_INCOMES.map((income) => ({ ...income })),
    expenses: [],
    categories: DEFAULT_CATEGORIES.map((category) => ({ ...category })),
  };
}

function cloneState(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeState(value) {
  const normalized = value && typeof value === "object" ? value : freshState();
  if (!Array.isArray(normalized.incomes)) normalized.incomes = [];
  if (!Array.isArray(normalized.expenses)) normalized.expenses = [];
  if (!Array.isArray(normalized.categories) || normalized.categories.length === 0) {
    normalized.categories = DEFAULT_CATEGORIES.map((category) => ({ ...category }));
  }
  return normalized;
}

// ── PERSISTENCE ───────────────────────────────────────────────────────────────
function load() {
  const savedPeriods = localStorage.getItem(PERIODS_STORAGE_KEY);
  if (savedPeriods) {
    try {
      periods = JSON.parse(savedPeriods);
    } catch {
      periods = {};
    }
  }
  if (!periods || Object.keys(periods).length === 0) {
    const legacy = localStorage.getItem("daramd_v1");
    periods = { Current: normalizeState(legacy ? JSON.parse(legacy) : freshState()) };
  }
  activePeriod = localStorage.getItem(ACTIVE_PERIOD_KEY) || "Current";
  if (!periods[activePeriod]) activePeriod = Object.keys(periods)[0];
  state = cloneState(normalizeState(periods[activePeriod]));
  save();
}
function save() {
  periods[activePeriod] = cloneState(normalizeState(state));
  localStorage.setItem(PERIODS_STORAGE_KEY, JSON.stringify(periods));
  localStorage.setItem(ACTIVE_PERIOD_KEY, activePeriod);
  // Keep the legacy key synchronized for backwards compatibility.
  localStorage.setItem("daramd_v1", JSON.stringify(state));
}

function switchPeriod(periodName) {
  if (!periods[periodName] || periodName === activePeriod) return;
  save();
  activePeriod = periodName;
  state = cloneState(normalizeState(periods[periodName]));
  localStorage.setItem(ACTIVE_PERIOD_KEY, activePeriod);
  localStorage.setItem("daramd_v1", JSON.stringify(state));
  render();
  pulseMain();
}

function renderPeriodSelector() {
  const select = document.getElementById("periodSelect");
  if (!select) return;
  select.innerHTML = Object.keys(periods)
    .map(
      (period) =>
        `<option value="${esc(period)}" ${period === activePeriod ? "selected" : ""}>${esc(period)}</option>`,
    )
    .join("");
}

function clearAllData() {
  if (!confirm(t("resetConfirm", { period: activePeriod }))) return;
  closeModal();
  state = freshState();
  save();
  render();
}

// ── PERIOD NAVIGATION (prev / next month) ─────────────────────────────────────
const PERIOD_NAME_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
});

// Shifts a period name by ±1 month. Calendar-like names ("Sep 2026")
// shift from themselves; free-form names ("Current", "Khordad") fall
// back to the real current month as the anchor.
function shiftPeriodName(name, delta) {
  const parsed = new Date(`1 ${name}`);
  const base = isNaN(parsed) ? new Date() : parsed;
  base.setDate(1);
  base.setMonth(base.getMonth() + delta);
  return PERIOD_NAME_FMT.format(base);
}

function gotoPeriod(delta) {
  const target = shiftPeriodName(activePeriod, delta);
  let created = false;
  if (!periods[target]) {
    periods[target] = freshState();
    created = true;
  }
  activePeriod = target;
  state = cloneState(normalizeState(periods[target]));
  localStorage.setItem(ACTIVE_PERIOD_KEY, activePeriod);
  localStorage.setItem("daramd_v1", JSON.stringify(state));
  save();
  render();
  pulseMain();
  if (created) showToast(t("newPeriodToast", { period: target }), "success");
}

// ── FORMAT ────────────────────────────────────────────────────────────────────
function fmt(n) {
  return Math.abs(n).toLocaleString("en-US");
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Tween a numeric readout from its previous value to the new one.
function animateNumber(el, target, format) {
  if (!el || !Number.isFinite(target)) return;
  const start = Number(el.dataset.val || 0);
  el.dataset.val = String(target);
  if (el._raf) cancelAnimationFrame(el._raf);
  if (start === target || prefersReducedMotion()) {
    el.textContent = format(target);
    return;
  }
  const t0 = performance.now();
  const dur = 700;
  const tick = (now) => {
    const p = Math.min((now - t0) / dur, 1);
    const ease = 1 - Math.pow(1 - p, 3); // ease-out cubic
    el.textContent = format(Math.round(start + (target - start) * ease));
    if (p < 1) el._raf = requestAnimationFrame(tick);
  };
  el._raf = requestAnimationFrame(tick);
}

// Brief opacity/translate pulse when the whole ledger swaps.
function pulseMain() {
  const root = document.getElementById("pageRoot");
  if (!root || prefersReducedMotion()) return;
  root.classList.remove("page-swap");
  void root.offsetWidth; // restart animation
  root.classList.add("page-swap");
}
function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const EMPTY_ICONS = {
  coins: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/></svg>`,
  receipt: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/></svg>`,
  layout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>`,
};

function emptyStateHtml(icon, title, hint) {
  return `
    <div class="empty-state fade-in" role="status">
      <div class="empty-state-icon">${EMPTY_ICONS[icon]}</div>
      <div class="empty-state-title">${esc(title)}</div>
      <div class="empty-state-hint">${esc(hint)}</div>
    </div>`;
}

// ── TOAST ─────────────────────────────────────────────────────────────────────
function showToast(msg, type = "success") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "show " + type;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => {
    t.className = "";
  }, 4000);
}

// ── THEME ─────────────────────────────────────────────────────────────────────
const THEME_KEY = "edifinance_theme";

const THEME_ICONS = {
  sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
};

function applyTheme(theme) {
  const normalized = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = normalized;
  try {
    localStorage.setItem(THEME_KEY, normalized);
  } catch {}
  const toggle = document.getElementById("themeToggle");
  if (toggle) {
    // Show the icon of the mode you'd switch to.
    toggle.innerHTML = normalized === "dark" ? THEME_ICONS.sun : THEME_ICONS.moon;
    toggle.setAttribute(
      "aria-label",
      normalized === "dark" ? "Switch to light mode" : "Switch to dark mode",
    );
  }
}

function currentTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function setTheme(theme) {
  if (theme === currentTheme()) return;
  // Prefer a full-page View Transition morph where supported.
  if (document.startViewTransition && !prefersReducedMotion()) {
    document.startViewTransition(() => {
      applyTheme(theme);
      if (typeof state !== "undefined") {
        try {
          render();
        } catch {}
      }
    });
    return;
  }
  document.documentElement.classList.add("theme-switching");
  applyTheme(theme);
  setTimeout(() =>
    document.documentElement.classList.remove("theme-switching"),
    400,
  );
  if (typeof state !== "undefined") {
    try {
      render(); // re-draw charts with the new palette
    } catch {}
  }
}

function toggleTheme() {
  setTheme(currentTheme() === "dark" ? "light" : "dark");
}

// ── SETTINGS MODAL ────────────────────────────────────────────────────────────
function openSettingsModal() {
  openModal(`
    <div class="modal-kicker">${esc(t("kickerSettings"))}</div>
    <div class="section-label" style="margin-bottom:22px;">${esc(t("settingsTitle"))}</div>

    <label class="field-label">${esc(t("appearance"))}</label>
    <div class="seg mb-4" role="group" aria-label="${esc(t("appearance"))}">
      <button type="button" class="seg-btn${currentTheme() === "dark" ? " active" : ""}" onclick="setAppTheme('dark')">
        ${THEME_ICONS.moon}<span>${esc(t("darkMode"))}</span>
      </button>
      <button type="button" class="seg-btn${currentTheme() === "light" ? " active" : ""}" onclick="setAppTheme('light')">
        ${THEME_ICONS.sun}<span>${esc(t("lightMode"))}</span>
      </button>
    </div>

    <label class="field-label">${esc(t("language"))}</label>
    <div class="seg mb-5" role="group" aria-label="${esc(t("language"))}">
      <button type="button" class="seg-btn${currentLang === "en" ? " active" : ""}" onclick="setAppLang('en')">
        <span>${esc(t("langEn"))}</span>
      </button>
      <button type="button" class="seg-btn${currentLang === "fa" ? " active" : ""}" onclick="setAppLang('fa')">
        <span>${esc(t("langFa"))}</span>
      </button>
    </div>

    <div class="danger-zone">
      <div class="danger-copy">
        <strong>${esc(t("resetTitle"))}</strong>
        <p>${esc(t("resetCopy", { period: activePeriod }))}</p>
      </div>
      <button class="btn-danger-solid" onclick="clearAllData()">${esc(t("resetAction"))}</button>
    </div>
  `);
}

function setAppTheme(value) {
  setTheme(value);
  openSettingsModal(); // refresh active states
}

function setAppLang(value) {
  setLang(value);
  openSettingsModal(); // re-render modal in the new language
}

// ── EXCEL IMPORT (Khordad Budget structure) ──────────────────────────────────
// Expected layout per the "Khordad Budget" sheet (0-indexed columns):
//   col1(B)=category name   col2(C)=budget total   col3(D)=spent
//   col6(G)=income name     col7(H)=income total
//   col9(J)=tx id  col10(K)=tx name  col11(L)=tx amount  col12(M)=type(want/need/saving)  col13(N)=tx category
let pendingWorkbook = null;
let pendingFileName = "";

function openImportModal() {
  openModal(
    `
    <div class="section-label" style="margin-bottom:18px;">${esc(t("importTitle"))}</div>
    <p style="font-size:13px;color:var(--muted);line-height:1.5;margin-bottom:18px;">
      ${esc(t("importCopy"))}
    </p>
    <div class="upload-zone" id="uploadZone">
      <input type="file" id="excelFileInput" accept=".xlsx,.xls" onchange="handleFileSelect(event)">
      <div style="font-size:14px;font-weight:600;color:var(--jade);">${esc(t("chooseFile"))}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:5px;">${esc(t("dropHere"))}</div>
    </div>
    <div style="display:flex;gap:10px;margin-top:22px;">
      <button class="btn-ghost" style="flex:1;padding:13px;" onclick="closeModal()">${esc(t("cancel"))}</button>
    </div>
  `,
    true,
  );

  setTimeout(() => {
    const zone = document.getElementById("uploadZone");
    if (!zone) return;
    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.classList.add("dragover");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("dragover");
      const file = e.dataTransfer.files[0];
      if (file && /\.(xlsx|xls)$/i.test(file.name)) {
        readWorkbookFile(file);
      } else {
        showToast(t("badDropFile"), "error");
      }
    });
  }, 0);
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  readWorkbookFile(file);
}

function readWorkbookFile(file) {
  pendingFileName = file.name;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      pendingWorkbook = XLSX.read(ev.target.result, { type: "array" });
      const sheetNames = pendingWorkbook.SheetNames;
      if (sheetNames.length === 1) {
        importFromSheet(sheetNames[0]);
      } else {
        showSheetPicker(sheetNames);
      }
    } catch (err) {
      showToast(t("readFileError", { err: err.message }), "error");
    }
  };
  reader.onerror = () => showToast(t("readFileFailed"), "error");
  reader.readAsArrayBuffer(file);
}

function showSheetPicker(sheetNames) {
  const budgetSheetNames = sheetNames.filter((name) =>
    name.toLowerCase().includes("budget"),
  );
  const encodedBudgetSheets = encodeURIComponent(JSON.stringify(budgetSheetNames)).replace(
    /'/g,
    "%27",
  );
  const options = sheetNames
    .map((name) => {
      const lower = name.toLowerCase();
      let tag = `<span class="tag" style="background:var(--ink-line);color:var(--muted);">${esc(t("tagOther"))}</span>`;
      if (lower.includes("budget"))
        tag = `<span class="tag tag-jade">${esc(t("tagBudget"))}</span>`;
      else if (lower.includes("accounting"))
        tag = `<span class="tag" style="background:var(--brass-soft);color:var(--brass);">${esc(t("tagLedger"))}</span>`;
      return `<div class="sheet-option" onclick="importFromSheet('${esc(name)}')">
      <span style="font-size:13px;font-weight:600;">${esc(name)}</span>
      ${tag}
    </div>`;
    })
    .join("");

  openModal(
    `
    <div class="section-label" style="margin-bottom:8px;">${esc(t("multiSheetTitle"))}</div>
    <p style="font-size:13px;color:var(--muted);margin-bottom:18px;">${esc(t("multiSheetCopy", { file: pendingFileName }))}</p>
    <div style="max-height:340px;overflow-y:auto;" class="scrollable">${options}</div>
    <div style="display:flex;gap:10px;margin-top:18px;">
      <button class="btn-ghost" style="flex:1;padding:13px;" onclick="closeModal()">${esc(t("cancel"))}</button>
      ${budgetSheetNames.length > 1 ? `<button class="btn-primary" style="flex:1;" onclick="importBudgetSheets('${encodedBudgetSheets}')">${esc(t("importAllBudgets"))}</button>` : ""}
    </div>
  `,
    true,
  );
}

function importBudgetSheets(encodedSheetNames) {
  const sheetNames = JSON.parse(decodeURIComponent(encodedSheetNames));
  sheetNames.forEach((sheetName) => importFromSheet(sheetName));
  showToast(t("importedSheetsToast", { n: sheetNames.length }), "success");
}

const IMPORT_CAT_MAP = {
  "food & drinks": "food",
  "food and drinks": "food",
  food: "food",
  family: "family",
  "housing & construction": "housing",
  "housing and construction": "housing",
  home: "housing",
  "work & growth": "work",
  "work and growth": "work",
  "work expenses": "work",
  "project expenses": "project",
  project: "project",
  "saving & investment": "saving",
  "saving and investment": "saving",
  saving: "saving",
  transportation: "transport",
  transport: "transport",
  "loans & debts": "loans",
  "loans and debts": "loans",
  "debts and loans": "loans",
  "bills, internet, vpn": "bills",
  bills: "bills",
  internet: "bills",
  "charity & donation": "charity",
  "charity and donation": "charity",
  donation: "charity",
  "gift and donation": "charity",
  "health & beauty": "health",
  "health and beauty": "health",
  health: "health",
  clothing: "clothing",
  cloth: "clothing",
  banking: "work",
  "fun & entertainment": "work",
  charge: "bills",
  wedding: "family",
};

function matchImportCategory(raw) {
  if (!raw) return null;
  const key = String(raw).toLowerCase().trim();
  return IMPORT_CAT_MAP[key] || null;
}

function ensureCategory(catId, rawLabel) {
  let cat = state.categories.find((c) => c.id === catId);
  if (!cat) {
    cat = { id: catId, label: rawLabel || catId, target: 0 };
    state.categories.push(cat);
  }
  return cat;
}

function findBudgetHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const normalized = (rows[i] || []).map((cell) =>
      String(cell || "")
        .toLowerCase()
        .trim(),
    );
    const hasNameTotalPair = normalized.some(
      (cell, index) => cell === "name" && normalized[index + 1] === "total",
    );
    if (hasNameTotalPair && normalized.includes("id")) return i;
  }
  return -1;
}

function importFromSheet(sheetName) {
  closeModal();
  if (!pendingWorkbook) {
    showToast("No file loaded", "error");
    return;
  }
  const ws = pendingWorkbook.Sheets[sheetName];
  if (!ws) {
    showToast("Sheet not found: " + sheetName, "error");
    return;
  }

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // Budget sheets may have blank/decorative leading columns, so locate the
  // adjacent name/total pair and transaction id header wherever they appear.
  const headerIdx = findBudgetHeaderRow(rows);

  if (headerIdx < 0) {
    showToast(t("badStructure"), "error");
    return;
  }

  const importPeriod = String(sheetName).replace(/\s+Budget$/i, "").trim() || sheetName;
  if (
    periods[importPeriod] &&
    !confirm(t("replacePeriodConfirm", { period: importPeriod }))
  ) {
    return;
  }

  // Persist the active ledger, then parse the selected sheet into an isolated
  // period. Imports must never append into the month currently being viewed.
  save();
  const previousPeriod = activePeriod;
  const previousState = cloneState(state);
  activePeriod = importPeriod;
  state = freshState();

  // Read column positions dynamically from the header row itself.
  // The header has two "name"/"total" pairs (categories + income) and one "id"/"name"/"total" triple (transactions).
  // We locate each group by scanning the header.
  const hdr = rows[headerIdx];
  let catNameIdx = -1,
    catTotalIdx = -1;
  let incNameIdx = -1,
    incTotalIdx = -1;
  let txIdIdx = -1,
    txNameIdx = -1,
    txAmtIdx = -1,
    txCatIdx = -1;

  let nameOccurrences = [];
  hdr.forEach((cell, idx) => {
    if (
      String(cell || "")
        .toLowerCase()
        .trim() === "name"
    )
      nameOccurrences.push(idx);
  });

  // First "name" group → categories
  if (nameOccurrences[0] !== undefined) {
    catNameIdx = nameOccurrences[0];
    catTotalIdx = catNameIdx + 1;
  }
  // Second "name" group → income sources
  if (nameOccurrences[1] !== undefined) {
    incNameIdx = nameOccurrences[1];
    incTotalIdx = incNameIdx + 1;
  }
  // "id" column → transaction block
  const txIdHdrIdx = hdr.findIndex(
    (c) =>
      String(c || "")
        .toLowerCase()
        .trim() === "id",
  );
  if (txIdHdrIdx !== -1) {
    txIdIdx = txIdHdrIdx;
    txNameIdx = txIdHdrIdx + 1;
    txAmtIdx = txIdHdrIdx + 2;
    // "category" may be at +3 (no Type col) or +4 (with Type col)
    const afterAmt = String(hdr[txIdHdrIdx + 3] || "")
      .toLowerCase()
      .trim();
    txCatIdx = afterAmt === "type" ? txIdHdrIdx + 4 : txIdHdrIdx + 3;
  }

  let newIncomeCount = 0,
    newExpenseCount = 0,
    updatedBudgets = 0;
  const newIncomeMap = {};

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;

    // Budget categories
    if (catNameIdx !== -1) {
      const catName = r[catNameIdx];
      const catTotal = parseFloat(r[catTotalIdx]);
      if (catName && !isNaN(catTotal) && catTotal > 0) {
        const lowerCat = String(catName).toLowerCase().trim();
        const isSummary = ["want:", "need:", "saving:", "balance:"].includes(
          lowerCat,
        );
        if (!isSummary) {
          const catId = matchImportCategory(catName);
          if (catId) {
            const cat = ensureCategory(catId, catName);
            cat.target = catTotal;
            updatedBudgets++;
          }
        }
      }
    }

    // Income sources
    if (incNameIdx !== -1) {
      const incName = r[incNameIdx];
      const incAmount = parseFloat(r[incTotalIdx]);
      if (incName && !isNaN(incAmount) && incAmount > 0) {
        const lowerName = String(incName).toLowerCase().trim();
        if (!["total icome:", "total income:", "goal:"].includes(lowerName)) {
          const id = lowerName.replace(/\s+/g, "_");
          newIncomeMap[id] = { id, name: String(incName), amount: incAmount };
          newIncomeCount++;
        }
      }
    }

    // Transactions
    if (txNameIdx !== -1) {
      const txName = r[txNameIdx];
      const txAmount = parseFloat(r[txAmtIdx]);
      const txCat = txCatIdx !== -1 ? r[txCatIdx] : null;
      if (
        txName &&
        !isNaN(txAmount) &&
        txAmount > 0 &&
        String(txName).toLowerCase().trim() !== "name"
      ) {
        let catId = matchImportCategory(txCat);
        if (!catId)
          catId = ensureCategory(
            "cat_" +
              String(txCat || "misc")
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "_"),
            txCat,
          ).id;
        state.expenses.push({
          id:
            Date.now().toString() +
            "_" +
            Math.random().toString(36).slice(2, 8),
          categoryId: catId,
          desc: String(txName),
          amount: txAmount,
          date: sheetName,
        });
        newExpenseCount++;
      }
    }
  }

  // Merge income streams: update existing, add new
  const existingIds = new Set(state.incomes.map((i) => i.id));
  Object.values(newIncomeMap).forEach((inc) => {
    if (existingIds.has(inc.id)) {
      const ex = state.incomes.find((i) => i.id === inc.id);
      ex.amount = inc.amount;
      ex.name = inc.name;
    } else {
      state.incomes.push(inc);
    }
  });

  if (newExpenseCount === 0 && newIncomeCount === 0 && updatedBudgets === 0) {
    activePeriod = previousPeriod;
    state = previousState;
    render();
    showToast(t("noDataFound", { sheet: sheetName }), "error");
  } else {
    save();
    render();
    showToast(
      t("importedPeriodToast", {
        sheet: sheetName,
        period: importPeriod,
        tx: newExpenseCount,
        inc: newIncomeCount,
        b: updatedBudgets,
      }),
      "success",
    );
  }
}

// ── ACTIONS ───────────────────────────────────────────────────────────────────
function openAddIncomeModal() {
  openModal(`
    <div class="modal-kicker">${esc(t("kickerIncome"))}</div>
    <div class="section-label" style="margin-bottom:8px;">${esc(t("addIncomeTitle"))}</div>
    <p class="modal-copy">${esc(t("addIncomeCopy"))}</p>
    <label class="field-label" for="incomeName">${esc(t("fieldStreamName"))}</label>
    <input type="text" id="incomeName" placeholder="${esc(t("phStreamExample"))}" class="mb-3">
    <label class="field-label" for="incomeAmount">${esc(t("fieldAmount"))}</label>
    <input type="number" id="incomeAmount" placeholder="${esc(t("phAmountToman"))}" min="1" step="1" class="mb-5">
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">${esc(t("cancel"))}</button>
      <button class="btn-primary" onclick="saveNewIncome()">${esc(t("saveIncome"))}</button>
    </div>
  `);
  setTimeout(() => document.getElementById("incomeName")?.focus(), 0);
}

function saveNewIncome() {
  const name = document.getElementById("incomeName").value.trim();
  const amount = parseFloat(document.getElementById("incomeAmount").value);
  if (!name || isNaN(amount) || amount <= 0)
    return alert(t("needNameAndAmount"));
  const id = name.toLowerCase().replace(/\s+/g, "_");
  const existing = state.incomes.find((i) => i.id === id);
  if (existing) {
    existing.amount = amount;
  } else {
    state.incomes.push({ id, name, amount });
  }
  closeModal();
  save();
  render();
}

function deleteIncome(id) {
  state.incomes = state.incomes.filter((i) => i.id !== id);
  save();
  render();
}

function openAddExpenseModal() {
  const catOptions = state.categories
    .map((c) => `<option value="${c.id}">${esc(c.label)}</option>`)
    .join("");
  openModal(`
    <div class="modal-kicker">${esc(t("kickerLedger"))}</div>
    <div class="section-label" style="margin-bottom:8px;">${esc(t("addExpenseTitle"))}</div>
    <p class="modal-copy">${esc(t("addExpenseCopy"))}</p>
    <label class="field-label" for="expenseCategory">${esc(t("fieldCategory"))}</label>
    <select id="expenseCategory" class="mb-3">
      <option value="">${esc(t("selectCategory"))}</option>
      ${catOptions}
    </select>
    <label class="field-label" for="expenseDesc">${esc(t("fieldDescription"))}</label>
    <input type="text" id="expenseDesc" placeholder="${esc(t("phDescription"))}" class="mb-3">
    <label class="field-label" for="expenseAmount">${esc(t("fieldAmount"))}</label>
    <input type="number" id="expenseAmount" placeholder="${esc(t("phAmountToman"))}" min="1" step="1" class="mb-5">
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">${esc(t("cancel"))}</button>
      <button class="btn-primary" onclick="saveNewExpense()">${esc(t("logExpenseAction"))}</button>
    </div>
  `);
  setTimeout(() => document.getElementById("expenseCategory")?.focus(), 0);
}

function saveNewExpense() {
  const catId = document.getElementById("expenseCategory").value;
  const desc = document.getElementById("expenseDesc").value.trim();
  const amount = parseFloat(document.getElementById("expenseAmount").value);
  if (!catId) return alert(t("needCategory"));
  if (isNaN(amount) || amount <= 0) return alert(t("needValidAmount"));
  state.expenses.push({
    id: Date.now().toString(),
    categoryId: catId,
    desc: desc || "",
    amount,
    date: new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
  });
  closeModal();
  save();
  render();
  showToast(t("expenseLogged"), "success");
}

function deleteExpense(id) {
  state.expenses = state.expenses.filter((e) => e.id !== id);
  save();
  render();
}

function saveNewBudget() {
  const emoji = document.getElementById("newCatEmoji").value.trim();
  const name = document.getElementById("newCatName").value.trim();
  const target = parseFloat(document.getElementById("newCatTarget").value);
  if (!name) return alert(t("needCategoryName"));
  if (isNaN(target) || target <= 0)
    return alert(t("needBudgetAmount"));
  const id = "cat_" + Date.now().toString(36);
  const label = emoji ? `${emoji} ${name}` : name;
  state.categories.push({ id, label, target });
  closeModal();
  save();
  render();
}

function exportToExcel() {
  if (typeof XLSX === "undefined") {
    return showToast(t("exportLibMissing"), "error");
  }

  const totalIncome = state.incomes.reduce((sum, item) => sum + item.amount, 0);
  const totalBudget = state.categories.reduce((sum, item) => sum + item.target, 0);
  const totalSpent = state.expenses.reduce((sum, item) => sum + item.amount, 0);
  const categoryName = (id) =>
    state.categories.find((category) => category.id === id)?.label || id;
  const budgetRows = state.categories.map((category) => {
    const spent = state.expenses
      .filter((expense) => expense.categoryId === category.id)
      .reduce((sum, expense) => sum + expense.amount, 0);
    return {
      Category: category.label,
      "Budget (Toman)": category.target,
      "Spent (Toman)": spent,
      "Remaining (Toman)": category.target - spent,
      "Used (%)": category.target > 0 ? Math.round((spent / category.target) * 100) : 0,
    };
  });
  const expenseRows = state.expenses.map((expense) => ({
    Date: expense.date || "",
    Category: categoryName(expense.categoryId),
    Description: expense.desc || "",
    "Amount (Toman)": expense.amount,
  }));
  const incomeRows = state.incomes.map((income) => ({
    Source: income.name,
    "Amount (Toman)": income.amount,
  }));
  const summaryRows = [
    { Metric: "Income", "Amount (Toman)": totalIncome },
    { Metric: "Allocated budget", "Amount (Toman)": totalBudget },
    { Metric: "Spent", "Amount (Toman)": totalSpent },
    { Metric: "Balance", "Amount (Toman)": totalIncome - totalSpent },
    { Metric: "Budget available", "Amount (Toman)": totalBudget - totalSpent },
  ];

  const workbook = XLSX.utils.book_new();
  const sheets = [
    ["Summary", summaryRows],
    ["Budgets", budgetRows],
    ["Expenses", expenseRows],
    ["Income", incomeRows],
  ];
  sheets.forEach(([name, rows]) => {
    const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Status: "No data" }]);
    const widths = Object.keys(rows[0] || { Status: "No data" }).map((key) => ({
      wch: Math.min(34, Math.max(14, key.length + 2)),
    }));
    sheet["!cols"] = widths;
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const periodSlug = activePeriod.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "");
  XLSX.writeFile(workbook, `EdiFinance-${periodSlug || "period"}-${stamp}.xlsx`);
  showToast(t("exportDone"));
}

function printLedger() {
  const meta = document.getElementById("printMeta");
  if (meta) {
    const date = new Date().toLocaleDateString("en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    meta.textContent = t("printMeta", { period: activePeriod, date });
  }
  window.print();
}

function splitCategoryLabel(label) {
  const value = String(label || "").trim();
  const match = value.match(/^(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)\s*(.*)$/u);
  return match ? { emoji: match[1], name: match[2] } : { emoji: "", name: value };
}

function saveEditedBudget(id) {
  const emoji = document.getElementById("editCatEmoji").value.trim();
  const name = document.getElementById("editCatName").value.trim();
  const target = parseFloat(document.getElementById("editCatTarget").value);
  if (!name) return showToast(t("needCategoryName"), "error");
  if (isNaN(target) || target <= 0)
    return showToast(t("needBudgetAmount"), "error");
  const category = state.categories.find((cat) => cat.id === id);
  if (!category) return;
  category.label = emoji ? `${emoji} ${name}` : name;
  category.target = target;
  closeModal();
  save();
  render();
  showToast(t("budgetUpdated"));
}

function saveEditedIncome(id) {
  const name = document.getElementById("editIncomeName").value.trim();
  const amount = parseFloat(document.getElementById("editIncomeAmount").value);
  if (!name || isNaN(amount) || amount <= 0)
    return alert(t("needNameAndAmount"));
  const inc = state.incomes.find((i) => i.id === id);
  if (inc) {
    inc.name = name;
    inc.amount = amount;
  }
  closeModal();
  save();
  render();
}

function saveEditedExpense(id) {
  const catId = document.getElementById("editExpenseCategory").value;
  const desc = document.getElementById("editExpenseDesc").value.trim();
  const amount = parseFloat(document.getElementById("editExpenseAmount").value);
  if (!catId) return alert(t("needCategory"));
  if (isNaN(amount) || amount <= 0) return alert(t("needValidAmount"));
  const exp = state.expenses.find((e) => e.id === id);
  if (exp) {
    exp.categoryId = catId;
    exp.desc = desc;
    exp.amount = amount;
  }
  closeModal();
  save();
  render();
}

// ── CONTEXT MENU ──────────────────────────────────────────────────────────────
let activeContextTarget = null;

function showContextMenu(e, type, id) {
  e.stopPropagation();
  closeContextMenu();
  activeContextTarget = { type, id };
  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.id = "activeContextMenu";
  menu.innerHTML = `
    <div class="context-menu-item" onclick="handleContextEdit()">${esc(t("edit"))}</div>
    <div class="context-menu-divider"></div>
    <div class="context-menu-item danger" onclick="handleContextDelete()">${esc(t("delete"))}</div>
  `;
  document.body.appendChild(menu);
  const pad = 8;
  const rect = menu.getBoundingClientRect();
  let x = e.clientX,
    y = e.clientY;
  if (x + rect.width + pad > window.innerWidth)
    x = window.innerWidth - rect.width - pad;
  if (y + rect.height + pad > window.innerHeight)
    y = window.innerHeight - rect.height - pad;
  menu.style.left = x + "px";
  menu.style.top = y + "px";
}

function closeContextMenu() {
  const m = document.getElementById("activeContextMenu");
  if (m) m.remove();
  activeContextTarget = null;
}

function handleContextEdit() {
  if (!activeContextTarget) return;
  const { type, id } = activeContextTarget;
  closeContextMenu();
  if (type === "income") openEditIncomeModal(id);
  else if (type === "expense") openEditExpenseModal(id);
}

function handleContextDelete() {
  if (!activeContextTarget) return;
  const { type, id } = activeContextTarget;
  closeContextMenu();
  if (type === "income") deleteIncome(id);
  else if (type === "expense") deleteExpense(id);
}

document.addEventListener("click", closeContextMenu);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeContextMenu();
    closeModal();
  }
});

// ── MODALS ────────────────────────────────────────────────────────────────────
function openModal(html, wide) {
  closeContextMenu();
  closeModal();
  const overlay = document.createElement("div");
  overlay.id = "modalOverlay";
  overlay.className = "modal-overlay";
  overlay.innerHTML = `<div class="modal-box${wide ? " wide" : ""}" onclick="event.stopPropagation()">${html}</div>`;
  overlay.onclick = closeModal;
  document.body.appendChild(overlay);
}

function closeModal() {
  const overlay = document.getElementById("modalOverlay");
  if (overlay) overlay.remove();
}

function deleteCategory(id) {
  const category = state.categories.find((cat) => cat.id === id);
  if (!category) return;
  const count = state.expenses.filter((e) => e.categoryId === id).length;
  if (!confirm(t("deleteCategoryConfirm", { label: category.label, n: count })))
    return;
  state.categories = state.categories.filter((cat) => cat.id !== id);
  state.expenses = state.expenses.filter((e) => e.categoryId !== id);
  closeModal();
  save();
  render();
}

function openAddBudgetModal() {
  openModal(`
    <div class="section-label" style="margin-bottom:18px;">${esc(t("addBudgetTitle"))}</div>
    <input type="text" id="newCatEmoji" placeholder="${esc(t("phEmojiExample"))}" class="mb-3" maxlength="4">
    <input type="text" id="newCatName" placeholder="${esc(t("phCategoryName"))}" class="mb-3">
    <input type="number" id="newCatTarget" placeholder="${esc(t("phMonthlyBudget"))}" class="mb-5">
    <div style="display:flex;gap:10px;">
      <button class="btn-ghost" style="flex:1;padding:13px;" onclick="closeModal()">${esc(t("cancel"))}</button>
      <button class="btn-primary" style="flex:1;" onclick="saveNewBudget()">${esc(t("addCategoryAction"))}</button>
    </div>
  `);
}

function openEditBudgetModal(id) {
  const category = state.categories.find((cat) => cat.id === id);
  if (!category) return;
  const parts = splitCategoryLabel(category.label);
  openModal(`
    <div class="modal-kicker">${esc(t("kickerBudget"))}</div>
    <div class="section-label" style="margin-bottom:8px;">${esc(t("editBudgetTitle"))}</div>
    <p class="modal-copy">${esc(t("editBudgetCopy"))}</p>
    <label class="field-label" for="editCatEmoji">${esc(t("fieldIcon"))}</label>
    <input type="text" id="editCatEmoji" value="${esc(parts.emoji)}" placeholder="${esc(t("phEmojiOptional"))}" class="mb-3" maxlength="8">
    <label class="field-label" for="editCatName">${esc(t("fieldCategoryName"))}</label>
    <input type="text" id="editCatName" value="${esc(parts.name)}" placeholder="${esc(t("fieldCategoryName"))}" class="mb-3">
    <label class="field-label" for="editCatTarget">${esc(t("fieldMonthlyLimit"))}</label>
    <input type="number" id="editCatTarget" value="${category.target}" min="1" step="1" class="mb-5" placeholder="${esc(t("phMonthlyBudget"))}">
    <div class="modal-actions triple">
      <button type="button" class="btn-ghost btn-danger-ghost" onclick="deleteCategory('${id}')">${esc(t("delete"))}</button>
      <button type="button" class="btn-ghost" onclick="closeModal()">${esc(t("cancel"))}</button>
      <button type="button" class="btn-primary" onclick="saveEditedBudget('${id}')">${esc(t("saveChanges"))}</button>
    </div>
  `);
  setTimeout(() => document.getElementById("editCatName")?.focus(), 0);
}

function openEditIncomeModal(id) {
  const inc = state.incomes.find((i) => i.id === id);
  if (!inc) return;
  openModal(`
    <div class="section-label" style="margin-bottom:18px;">${esc(t("editIncomeTitle"))}</div>
    <input type="text" id="editIncomeName" value="${esc(inc.name)}" class="mb-3" placeholder="${esc(t("phStreamName"))}">
    <input type="number" id="editIncomeAmount" value="${inc.amount}" class="mb-5" placeholder="${esc(t("phAmountToman"))}">
    <div class="modal-actions triple">
      <button type="button" class="btn-ghost btn-danger-ghost" onclick="deleteIncome('${id}')">${esc(t("delete"))}</button>
      <button type="button" class="btn-ghost" onclick="closeModal()">${esc(t("cancel"))}</button>
      <button type="button" class="btn-primary" style="flex:1;" onclick="saveEditedIncome('${id}')">${esc(t("saveChanges"))}</button>
    </div>
  `);
}

function openEditExpenseModal(id) {
  const exp = state.expenses.find((e) => e.id === id);
  if (!exp) return;
  const catOptions = state.categories
    .map(
      (c) =>
        `<option value="${c.id}" ${c.id === exp.categoryId ? "selected" : ""}>${c.label}</option>`,
    )
    .join("");
  openModal(`
    <div class="section-label" style="margin-bottom:18px;">${esc(t("editExpenseTitle"))}</div>
    <select id="editExpenseCategory" class="mb-3">${catOptions}</select>
    <input type="text" id="editExpenseDesc" value="${esc(exp.desc || "")}" class="mb-3" placeholder="${esc(t("phDescription"))}">
    <input type="number" id="editExpenseAmount" value="${exp.amount}" class="mb-5" placeholder="${esc(t("phAmountToman"))}">
    <div class="modal-actions triple">
      <button type="button" class="btn-ghost btn-danger-ghost" onclick="deleteExpense('${id}')">${esc(t("delete"))}</button>
      <button type="button" class="btn-ghost" onclick="closeModal()">${esc(t("cancel"))}</button>
      <button type="button" class="btn-primary" style="flex:1;" onclick="saveEditedExpense('${id}')">${esc(t("saveChanges"))}</button>
    </div>
  `);
}

// ── PERFORATION STRIP ─────────────────────────────────────────────────────────
function renderPerfStrip() {
  const row = document.getElementById("perfRow");
  if (!row) return;
  const width = row.parentElement.clientWidth || 1200;
  const count = Math.max(8, Math.floor(width / 16));
  row.innerHTML = Array(count).fill('<div class="perf-dot"></div>').join("");
}

// ── SCROLL REVEAL ─────────────────────────────────────────────────────────────
function initReveal() {
  const els = document.querySelectorAll(".reveal");
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.1 },
  );
  // Stagger the entrances so cards cascade in.
  els.forEach((el, i) => {
    el.style.transitionDelay = `${Math.min(i * 90, 450)}ms`;
    io.observe(el);
  });
}

// ── RENDER ────────────────────────────────────────────────────────────────────
let incomeChart = null,
  spendChart = null;

function render() {
  renderPeriodSelector();
  const totalIncome = state.incomes.reduce((s, i) => s + i.amount, 0);
  const totalBudget = state.categories.reduce((s, c) => s + c.target, 0);
  const totalSpent = state.expenses.reduce((s, e) => s + e.amount, 0);
  const balance = totalIncome - totalSpent;

  // Metrics — tweened counters
  animateNumber(document.getElementById("metricIncome"), totalIncome, fmt);
  animateNumber(document.getElementById("metricBudget"), totalBudget, fmt);
  animateNumber(document.getElementById("metricSpent"), totalSpent, fmt);
  const balEl = document.getElementById("metricBalance");
  animateNumber(balEl, balance, (v) => (balance < 0 ? "−" : "") + fmt(v));
  balEl.style.color = balance < 0 ? "#FF8060" : "#39E6AD";

  // Income list
  const il = document.getElementById("incomeList");
  il.innerHTML =
    state.incomes.length === 0
      ? emptyStateHtml("coins", t("esNoIncome"), t("esNoIncomeHint"))
      : state.incomes
          .map(
            (inc) => `
      <div class="fade-in row-item" style="padding:13px 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--ink-line);" onclick="showContextMenu(event,'income','${inc.id}')">
        <div>
          <div style="font-size:13px;font-weight:600;">${esc(inc.name)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="num" style="font-size:13px;font-weight:700;color:#39E6AD;">${fmt(inc.amount)}</span>
        </div>
      </div>`,
          )
          .join("");

  // Transaction table
  const tbody = document.getElementById("txBody");
  const sorted = [...state.expenses].reverse();
  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="padding:0;">${emptyStateHtml(
      "receipt",
      t("esNoExpense"),
      t("esNoExpenseHint"),
    )}</td></tr>`;
  } else {
    tbody.innerHTML = sorted
      .map((e) => {
        const cat = state.categories.find((c) => c.id === e.categoryId);
        return `<tr class="fade-in row-item" style="border-top:1px solid var(--ink-line);" onclick="showContextMenu(event,'expense','${e.id}')">
        <td style="padding:11px 0;font-size:11px;color:var(--muted);">${cat ? esc(cat.label.substring(0, 14)) : esc(e.categoryId)}</td>
        <td style="padding:11px 4px;font-size:11px;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(e.desc) || "—"}</td>
        <td class="num" style="padding:11px 0;text-align:end;font-size:12px;">${fmt(e.amount)}</td>
        <td style="padding:11px 0;text-align:end;color:var(--muted-2);font-size:14px;">⋯</td>
      </tr>`;
      })
      .join("");
  }

  // Budget tracker
  const bt = document.getElementById("budgetTracker");
  const budgetSummary = document.getElementById("budgetSummary");
  const budgetRemaining = totalBudget - totalSpent;
  const usedPct = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
  budgetSummary.innerHTML = `
    <div><span>${esc(t("monthlyPlan"))}</span><strong class="num">${fmt(totalBudget)}</strong></div>
    <div><span>${esc(t("usedLabel"))}</span><strong class="num">${usedPct}%</strong></div>
    <div><span>${esc(budgetRemaining >= 0 ? t("available") : t("overPlan"))}</span><strong class="num ${budgetRemaining < 0 ? "is-over" : ""}">${fmt(budgetRemaining)}</strong></div>
  `;
  bt.innerHTML =
    state.categories.length === 0
      ? emptyStateHtml(
          "layout",
          t("esNoCategories"),
          t("esNoCategoriesHint"),
        )
      : state.categories
    .map((cat) => {
      const spent = state.expenses
        .filter((e) => e.categoryId === cat.id)
        .reduce((s, e) => s + e.amount, 0);
      const pct = cat.target > 0 ? (spent / cat.target) * 100 : 0;
      const pctDisplay = Math.round(pct);
      const fillPct = Math.min(pct, 100);
      const over = spent > cat.target;
      const ovBy = spent - cat.target;
      const remaining = cat.target - spent;
      return `
    <article class="budget-item${over ? " is-over" : ""}">
      <div class="budget-item-head">
        <span class="budget-name">${esc(cat.label)}</span>
        <button class="icon-btn" type="button" aria-label="Edit ${esc(cat.label)} budget" title="Edit budget" onclick="openEditBudgetModal('${cat.id}')">${esc(t("edit")).replace("✏️ ", "")}</button>
      </div>
      <div class="budget-amount-row">
        <div><span>${esc(t("spent"))}</span><strong class="num">${fmt(spent)}</strong></div>
        <div><span>${esc(over ? t("over") : t("remaining"))}</span><strong class="num">${fmt(remaining)}</strong></div>
      </div>
      <div class="progress-track" role="progressbar" aria-label="${esc(cat.label)} budget usage" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(pctDisplay, 100)}">
        <div class="progress-fill" style="width:${fillPct}%;background:${over ? "var(--rust)" : "var(--jade)"};"></div>
      </div>
      ${over ? `<div style="display:flex;justify-content:flex-end;margin-top:9px;"><span class="tag tag-rust">${esc(t("overByTag", { amount: fmt(ovBy) }))}</span></div>` : ""}
      <div class="budget-item-foot"><span>${pctDisplay}% ${esc(t("usedPct"))}</span><span class="num">${fmt(cat.target)} ${esc(t("limit"))}</span></div>
    </article>`;
    })
    .join("");

  const printBudgetBody = document.getElementById("printBudgetBody");
  if (printBudgetBody) {
    printBudgetBody.innerHTML = state.categories
      .map((category) => {
        const spent = state.expenses
          .filter((expense) => expense.categoryId === category.id)
          .reduce((sum, expense) => sum + expense.amount, 0);
        const remaining = category.target - spent;
        const used = category.target > 0 ? Math.round((spent / category.target) * 100) : 0;
        return `<tr>
          <td>${esc(category.label)}</td>
          <td class="num">${fmt(category.target)}</td>
          <td class="num">${fmt(spent)}</td>
          <td class="num">${remaining < 0 ? "−" : ""}${fmt(remaining)}</td>
          <td class="num">${used}%</td>
        </tr>`;
      })
      .join("");
  }

  // Charts
  try {
    renderCharts(totalIncome);
  } catch (err) {
    console.error("Chart render failed:", err);
  }
}

function setChartEmpty(canvasId, show, icon, title, hint) {
  const canvas = document.getElementById(canvasId);
  const wrap = canvas && canvas.parentElement;
  if (!wrap) return;
  let el = wrap.querySelector(".chart-empty");
  if (show) {
    if (!el) {
      el = document.createElement("div");
      el.className = "chart-empty";
      el.innerHTML = emptyStateHtml(icon, title, hint);
      wrap.appendChild(el);
    }
  } else if (el) {
    el.remove();
  }
}

function renderCharts(totalIncome) {
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();

  // Income donut
  const incCtx = document.getElementById("incomeChart").getContext("2d");
  const incomeColors = [
    "#1FAE7E",
    "#C9A35F",
    "#E2633E",
    "#5C8AE6",
    "#9B6DFF",
    "#06B6D4",
    "#F0B429",
    "#4ADE80",
  ];
  if (incomeChart) incomeChart.destroy();

  setChartEmpty(
    "incomeChart",
    state.incomes.length === 0,
    "coins",
    t("esNoIncomeChart"),
    t("esNoIncomeChartHint"),
  );

  if (state.incomes.length === 0) {
    incomeChart = null;
  } else {
    incomeChart = new Chart(incCtx, {
      type: "doughnut",
      data: {
        labels: state.incomes.map((i) => i.name),
        datasets: [
          {
            data: state.incomes.map((i) => i.amount),
            backgroundColor: incomeColors.slice(0, state.incomes.length),
            borderColor: v("--chart-border"),
            borderWidth: 3,
            hoverOffset: 8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: "68%",
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: v("--chart-label"),
              font: { family: uiFont(), size: 11 },
              padding: 14,
              usePointStyle: true,
              pointStyle: "circle",
            },
          },
          tooltip: {
            backgroundColor: v("--chart-tip-bg"),
            borderColor: v("--chart-tip-border"),
            borderWidth: 1,
            padding: 12,
            titleFont: { family: uiFont(), weight: "600" },
            bodyFont: { family: "JetBrains Mono" },
            callbacks: {
              label: (ctx) =>
                ` ${ctx.label}: ${ctx.raw.toLocaleString()} Toman`,
            },
          },
        },
      },
    });
  }

  // Spending bar chart
  const spCtx = document.getElementById("spendChart").getContext("2d");
  if (spendChart) spendChart.destroy();

  const catTotals = state.categories
    .map((cat) => ({
      label: cat.label,
      spent: state.expenses
        .filter((e) => e.categoryId === cat.id)
        .reduce((s, e) => s + e.amount, 0),
      target: cat.target,
    }))
    .filter((c) => c.spent > 0)
    .sort((a, b) => b.spent - a.spent);

  setChartEmpty(
    "spendChart",
    catTotals.length === 0,
    "receipt",
    t("esNothingSpent"),
    t("esNothingSpentHint"),
  );

  if (catTotals.length === 0) {
    spendChart = null;
  } else {
    spendChart = new Chart(spCtx, {
      type: "bar",
      data: {
        labels: catTotals.map((c) => c.label),
        datasets: [
          {
            label: t("seriesSpent"),
            data: catTotals.map((c) => c.spent),
            backgroundColor: catTotals.map((c) =>
              c.spent > c.target
                ? "rgba(226,99,62,0.75)"
                : "rgba(31,174,126,0.75)",
            ),
            borderRadius: 3,
            borderSkipped: false,
            barThickness: 16,
          },
          {
            label: t("seriesBudget"),
            data: catTotals.map((c) => c.target),
            backgroundColor: v("--chart-bar-dim"),
            borderRadius: 3,
            borderSkipped: false,
            barThickness: 16,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: v("--chart-label"),
              font: { family: uiFont(), size: 11 },
              usePointStyle: true,
              pointStyle: "rect",
            },
          },
          tooltip: {
            backgroundColor: v("--chart-tip-bg"),
            borderColor: v("--chart-tip-border"),
            borderWidth: 1,
            padding: 12,
            titleFont: { family: uiFont(), weight: "600" },
            bodyFont: { family: "JetBrains Mono" },
            callbacks: {
              label: (ctx) =>
                ` ${ctx.dataset.label}: ${ctx.raw.toLocaleString()} Toman`,
            },
          },
        },
        scales: {
          x: {
            ticks: {
              color: v("--chart-tick"),
              font: { size: 10, family: "JetBrains Mono" },
            },
            grid: { color: v("--chart-grid") },
          },
          y: {
            ticks: {
              color: v("--chart-label"),
              font: { size: 11, family: uiFont() },
            },
            grid: { color: "transparent" },
          },
        },
      },
    });
  }
}

// ── INIT ──────────────────────────────────────────────────────────────────────
applyTheme(currentTheme());
load();
render();
renderPerfStrip();
window.addEventListener("resize", renderPerfStrip);
initReveal();
