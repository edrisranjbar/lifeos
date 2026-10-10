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

// ── Tiny template helper (replaces former t() with {var} interpolation) ──
function __t(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
let periods = {};
let activePeriod = "Current";

// Unit label from the currency chosen in Settings (amounts are never converted).
const currencyUnit = () => window.lifeOsCurrency?.unit() ?? "Toman";
let renderedUnit = currencyUnit();

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
  const savedPeriods = appStorage.getItem(PERIODS_STORAGE_KEY);
  if (savedPeriods) {
    try {
      periods = JSON.parse(savedPeriods);
    } catch {
      periods = {};
    }
  }
  if (!periods || Object.keys(periods).length === 0) {
    const legacy = appStorage.getItem("daramd_v1");
    periods = { Current: normalizeState(legacy ? JSON.parse(legacy) : freshState()) };
  }
  activePeriod = appStorage.getItem(ACTIVE_PERIOD_KEY) || "Current";
  if (!periods[activePeriod]) activePeriod = Object.keys(periods)[0];
  state = cloneState(normalizeState(periods[activePeriod]));
  save();
}
function save() {
  periods[activePeriod] = cloneState(normalizeState(state));
  appStorage.setItem(PERIODS_STORAGE_KEY, JSON.stringify(periods));
  appStorage.setItem(ACTIVE_PERIOD_KEY, activePeriod);
  // Keep the legacy key synchronized for backwards compatibility.
  appStorage.setItem("daramd_v1", JSON.stringify(state));
}

function switchPeriod(periodName) {
  if (!periods[periodName] || periodName === activePeriod) return;
  save();
  activePeriod = periodName;
  state = cloneState(normalizeState(periods[periodName]));
  appStorage.setItem(ACTIVE_PERIOD_KEY, activePeriod);
  appStorage.setItem("daramd_v1", JSON.stringify(state));
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
  if (!confirm(__t("Reset all data in \"{period}\" to defaults?", { period: activePeriod }))) return;
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
  appStorage.setItem(ACTIVE_PERIOD_KEY, activePeriod);
  appStorage.setItem("daramd_v1", JSON.stringify(state));
  save();
  render();
  pulseMain();
  if (created) showToast(__t("New period \"{period}\" created.", { period: target }), "success");
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
  el.dataset.val = String(target);
  el.textContent = format(target);
}

// Brief opacity/translate pulse when the whole ledger swaps.
function pulseMain() {
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
    appStorage.setItem(THEME_KEY, normalized);
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
  applyTheme(theme);
  render();
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
    <div class="modal-kicker">${esc("Preferences")}</div>
    <div class="section-label" style="margin-bottom:22px;">${esc("Settings")}</div>

    <label class="field-label">${esc("Appearance")}</label>
    <div class="seg mb-4" role="group" aria-label="${esc("Appearance")}">
      <button type="button" class="seg-btn${currentTheme() === "dark" ? " active" : ""}" onclick="setAppTheme('dark')">
        ${THEME_ICONS.moon}<span>${esc("Dark")}</span>
      </button>
      <button type="button" class="seg-btn${currentTheme() === "light" ? " active" : ""}" onclick="setAppTheme('light')">
        ${THEME_ICONS.sun}<span>${esc("Light")}</span>
      </button>
    </div>

    <div class="danger-zone">
      <div class="danger-copy">
        <strong>${esc("Reset all data")}</strong>
        <p>${esc(__t("Every income stream, expense and budget in \"{period}\" will be wiped and replaced with defaults. This cannot be undone.", { period: activePeriod }))}</p>
      </div>
      <button class="btn-danger-solid" onclick="clearAllData()">${esc("Reset period data")}</button>
    </div>
  `);
}

function setAppTheme(value) {
  setTheme(value);
  openSettingsModal(); // refresh active states
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
    <div class="section-label" style="margin-bottom:18px;">${esc("Import from Excel")}</div>
    <p style="font-size:13px;color:var(--muted);line-height:1.5;margin-bottom:18px;">
      ${esc("Upload your finance workbook. Sheets matching the Budget structure (category totals, income sources, and a transaction list) will be parsed automatically.")}
    </p>
    <div class="upload-zone" id="uploadZone">
      <input type="file" id="excelFileInput" accept=".xlsx,.xls" onchange="handleFileSelect(event)">
      <div style="font-size:14px;font-weight:600;color:var(--jade);">${esc("📂 Choose .xlsx file")}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:5px;">${esc("or drag & drop here")}</div>
    </div>
    <div style="display:flex;gap:10px;margin-top:22px;">
      <button class="btn-ghost" style="flex:1;padding:13px;" onclick="closeModal()">${esc("Cancel")}</button>
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
        showToast("Please drop an .xlsx or .xls file", "error");
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
      showToast(__t("Could not read file: {err}", { err: err.message }), "error");
    }
  };
  reader.onerror = () => showToast("Failed to read file", "error");
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
      let tag = `<span class="tag" style="background:var(--ink-line);color:var(--muted);">${esc("Other")}</span>`;
      if (lower.includes("budget"))
        tag = `<span class="tag tag-jade">${esc("Budget")}</span>`;
      else if (lower.includes("accounting"))
        tag = `<span class="tag" style="background:var(--brass-soft);color:var(--brass);">${esc("Ledger")}</span>`;
      return `<div class="sheet-option" onclick="importFromSheet('${esc(name)}')">
      <span style="font-size:13px;font-weight:600;">${esc(name)}</span>
      ${tag}
    </div>`;
    })
    .join("");

  openModal(
    `
    <div class="section-label" style="margin-bottom:8px;">${esc("Multiple sheets found")}</div>
    <p style="font-size:13px;color:var(--muted);margin-bottom:18px;">${esc(__t("Choose which sheet to import from {file}.", { file: pendingFileName }))}</p>
    <div style="max-height:340px;overflow-y:auto;" class="scrollable">${options}</div>
    <div style="display:flex;gap:10px;margin-top:18px;">
      <button class="btn-ghost" style="flex:1;padding:13px;" onclick="closeModal()">${esc("Cancel")}</button>
      ${budgetSheetNames.length > 1 ? `<button class="btn-primary" style="flex:1;" onclick="importBudgetSheets('${encodedBudgetSheets}')">${esc("Import all Budget sheets")}</button>` : ""}
    </div>
  `,
    true,
  );
}

function importBudgetSheets(encodedSheetNames) {
  const sheetNames = JSON.parse(decodeURIComponent(encodedSheetNames));
  sheetNames.forEach((sheetName) => importFromSheet(sheetName));
  showToast(__t("✓ Imported {n} Budget sheets as separate periods.", { n: sheetNames.length }), "success");
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
    showToast("This sheet doesn\'t match the expected Budget structure", "error");
    return;
  }

  const importPeriod = String(sheetName).replace(/\s+Budget$/i, "").trim() || sheetName;
  if (
    periods[importPeriod] &&
    !confirm(__t("Replace the existing \"{period}\" period with this sheet?", { period: importPeriod }))
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
    showToast(__t("No matching data found in \"{sheet}\"", { sheet: sheetName }), "error");
  } else {
    save();
    render();
    showToast(
      __t("✓ Imported \"{sheet}\" as a separate {period} period: {tx} transactions, {inc} income streams, {b} budgets", {
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
    <div class="modal-kicker">${esc("Income stream")}</div>
    <div class="section-label" style="margin-bottom:8px;">${esc("Add Income")}</div>
    <p class="modal-copy">${esc("Log a new source of income, or update an existing one by reusing its name.")}</p>
    <label class="field-label" for="incomeName">${esc("Stream name")}</label>
    <input type="text" id="incomeName" placeholder="${esc("e.g. Salary")}" class="mb-3">
    <label class="field-label" for="incomeAmount">${esc(`Amount in ${currencyUnit()}`)}</label>
    <input type="number" id="incomeAmount" placeholder="${esc(`Amount in ${currencyUnit()}`)}" min="1" step="1" class="mb-5">
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">${esc("Cancel")}</button>
      <button class="btn-primary" onclick="saveNewIncome()">${esc("Save Income")}</button>
    </div>
  `);
  setTimeout(() => document.getElementById("incomeName")?.focus(), 0);
}

function saveNewIncome() {
  const name = document.getElementById("incomeName").value.trim();
  const amount = parseFloat(document.getElementById("incomeAmount").value);
  if (!name || isNaN(amount) || amount <= 0)
    return alert("Enter a name and valid amount.");
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
  if (protectLinkedExpense(id, 'income')) return;
  state.incomes = state.incomes.filter((i) => i.id !== id);
  save();
  render();
}

function openAddExpenseModal() {
  const catOptions = state.categories
    .map((c) => `<option value="${c.id}">${esc(c.label)}</option>`)
    .join("");
  openModal(`
    <div class="modal-kicker">${esc("Ledger entry")}</div>
    <div class="section-label" style="margin-bottom:8px;">${esc("Log Expense")}</div>
    <p class="modal-copy">${esc("Record what you paid and where it belongs in the budget.")}</p>
    <label class="field-label" for="expenseCategory">${esc("Category")}</label>
    <select id="expenseCategory" class="mb-3">
      <option value="">${esc("— Select Category —")}</option>
      ${catOptions}
    </select>
    <label class="field-label" for="expenseDesc">${esc("Description")}</label>
    <input type="text" id="expenseDesc" placeholder="${esc("Description (optional)")}" class="mb-3">
    <label class="field-label" for="expenseAmount">${esc(`Amount in ${currencyUnit()}`)}</label>
    <input type="number" id="expenseAmount" placeholder="${esc(`Amount in ${currencyUnit()}`)}" min="1" step="1" class="mb-5">
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">${esc("Cancel")}</button>
      <button class="btn-primary" onclick="saveNewExpense()">${esc("Log Expense")}</button>
    </div>
  `);
  setTimeout(() => document.getElementById("expenseCategory-trigger")?.focus(), 0);
}

function saveNewExpense() {
  const catId = document.getElementById("expenseCategory").value;
  const desc = document.getElementById("expenseDesc").value.trim();
  const amount = parseFloat(document.getElementById("expenseAmount").value);
  if (!catId) return alert("Select a category.");
  if (isNaN(amount) || amount <= 0) return alert("Enter a valid amount.");
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
  showToast("✓ Expense logged.", "success");
}

function deleteExpense(id) {
  if (protectLinkedExpense(id)) return;
  state.expenses = state.expenses.filter((e) => e.id !== id);
  save();
  render();
}

function saveNewBudget() {
  const emoji = document.getElementById("newCatEmoji").value.trim();
  const name = document.getElementById("newCatName").value.trim();
  const target = parseFloat(document.getElementById("newCatTarget").value);
  if (!name) return alert("Enter a category name.");
  if (isNaN(target) || target <= 0)
    return alert("Enter a valid budget amount.");
  const id = "cat_" + Date.now().toString(36);
  const label = emoji ? `${emoji} ${name}` : name;
  state.categories.push({ id, label, target });
  closeModal();
  save();
  render();
}

function exportToExcel() {
  if (typeof XLSX === "undefined") {
    return showToast("Excel export library is unavailable.", "error");
  }

  const totalIncome = state.incomes.reduce((sum, item) => sum + item.amount, 0);
  const totalBudget = state.categories.reduce((sum, item) => sum + item.target, 0);
  const totalSpent = state.expenses.reduce((sum, item) => sum + item.amount, 0);
  const categoryName = (id) =>
    state.categories.find((category) => category.id === id)?.label || id;
  const unit = currencyUnit();
  const budgetRows = state.categories.map((category) => {
    const spent = state.expenses
      .filter((expense) => expense.categoryId === category.id)
      .reduce((sum, expense) => sum + expense.amount, 0);
    return {
      Category: category.label,
      [`Budget (${unit})`]: category.target,
      [`Spent (${unit})`]: spent,
      [`Remaining (${unit})`]: category.target - spent,
      "Used (%)": category.target > 0 ? Math.round((spent / category.target) * 100) : 0,
    };
  });
  const expenseRows = state.expenses.map((expense) => ({
    Date: expense.date || "",
    Category: categoryName(expense.categoryId),
    Description: expense.desc || "",
    [`Amount (${unit})`]: expense.amount,
  }));
  const incomeRows = state.incomes.map((income) => ({
    Source: income.name,
    [`Amount (${unit})`]: income.amount,
  }));
  const summaryRows = [
    { Metric: "Income", [`Amount (${unit})`]: totalIncome },
    { Metric: "Allocated budget", [`Amount (${unit})`]: totalBudget },
    { Metric: "Spent", [`Amount (${unit})`]: totalSpent },
    { Metric: "Balance", [`Amount (${unit})`]: totalIncome - totalSpent },
    { Metric: "Budget available", [`Amount (${unit})`]: totalBudget - totalSpent },
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
  showToast("Excel report exported.");
}

function printLedger() {
  const meta = document.getElementById("printMeta");
  if (meta) {
    const date = new Date().toLocaleDateString("en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    meta.textContent = __t("{period} financial report · {date} · Values in {unit}", { period: activePeriod, date, unit: currencyUnit() });
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
  if (!name) return showToast("Enter a category name.", "error");
  if (isNaN(target) || target <= 0)
    return showToast("Enter a valid budget amount.", "error");
  const category = state.categories.find((cat) => cat.id === id);
  if (!category) return;
  category.label = emoji ? `${emoji} ${name}` : name;
  category.target = target;
  closeModal();
  save();
  render();
  showToast("Budget updated.");
}

function saveEditedIncome(id) {
  if (protectLinkedExpense(id, 'income')) return;
  const name = document.getElementById("editIncomeName").value.trim();
  const amount = parseFloat(document.getElementById("editIncomeAmount").value);
  if (!name || isNaN(amount) || amount <= 0)
    return alert("Enter a name and valid amount.");
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
  if (protectLinkedExpense(id)) return;
  const catId = document.getElementById("editExpenseCategory").value;
  const desc = document.getElementById("editExpenseDesc").value.trim();
  const amount = parseFloat(document.getElementById("editExpenseAmount").value);
  if (!catId) return alert("Select a category.");
  if (isNaN(amount) || amount <= 0) return alert("Enter a valid amount.");
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
function protectLinkedExpense(id, kind = 'expense') {
  try {
    const decisions = JSON.parse(appStorage.getItem('edi_obligations_v1') || '{}').decisions || {};
    const key = kind === 'income' ? 'incomeId' : 'expenseId';
    const linked = Object.entries(decisions).find(([, payment]) => payment.status === 'paid' && payment.period === activePeriod && payment[key] === String(id));
    if (!linked) return false;
    showToast(kind === 'income'
      ? 'This income records money owed to you. Undo the receipt in Debts & credits before changing it.'
      : 'This expense records a scheduled payment. Undo the payment in Debts & credits before changing it.', 'error');
    dispatchEvent(new CustomEvent('finance-open-payment', {detail:{id:linked[0]}}));
    return true;
  } catch {
    showToast('Unable to check payment links. Reload before changing this expense.', 'error');
    return true;
  }
}
let activeContextTarget = null;

function showContextMenu(e, type, id) {
  e.stopPropagation();
  closeContextMenu();
  activeContextTarget = { type, id };
  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.id = "activeContextMenu";
  menu.innerHTML = `
    <div class="context-menu-item" onclick="handleContextEdit()">${esc("✏️ Edit")}</div>
    <div class="context-menu-divider"></div>
    <div class="context-menu-item danger" onclick="handleContextDelete()">${esc("🗑️ Delete")}</div>
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
  overlay.querySelectorAll('#expenseCategory, #editExpenseCategory').forEach(enhanceCategorySelect);
}

// Keep the original select as the source of truth for existing save handlers.
function enhanceCategorySelect(select) {
  const fa = document.documentElement.lang === 'fa';
  const words = fa
    ? { label: 'دسته‌بندی', placeholder: 'انتخاب دسته‌بندی', search: 'جستجوی دسته‌بندی…', empty: 'دسته‌بندی پیدا نشد', remaining: 'باقی‌مانده', noBudget: 'بدون بودجه', count: 'دسته‌بندی' }
    : { label: 'Category', placeholder: 'Choose a category', search: 'Search categories…', empty: 'No categories found', remaining: 'remaining', noBudget: 'No budget set', count: 'categories' };
  const wrapper = document.createElement('div');
  wrapper.className = 'category-picker mb-3';
  wrapper.innerHTML = `<button type="button" class="category-trigger" aria-haspopup="listbox" aria-expanded="false" aria-label="${words.label}"><span class="category-selected"></span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><div class="category-popover" hidden><div class="category-search"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input type="text" role="combobox" aria-label="${words.search}" placeholder="${words.search}" aria-autocomplete="list" aria-expanded="false" autocomplete="off"></div><div class="category-options" role="listbox" aria-label="${words.label}"></div><div class="category-count"></div></div>`;
  select.after(wrapper);
  select.hidden = true;
  const trigger = wrapper.querySelector('.category-trigger');
  const panel = wrapper.querySelector('.category-popover');
  const input = wrapper.querySelector('input');
  const list = wrapper.querySelector('.category-options');
  list.id = select.id + '-options';
  input.setAttribute('aria-controls', list.id);
  trigger.setAttribute('aria-controls', list.id);
  const label = document.querySelector(`label[for="${select.id}"]`);
  trigger.id = select.id + '-trigger';
  if (label) label.htmlFor = trigger.id;
  let active = -1;
  let filtered = [];
  const normalize = text => text.normalize('NFKC').toLocaleLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim();
  function updateLabel() {
    wrapper.querySelector('.category-selected').textContent = select.value ? select.selectedOptions[0]?.textContent || words.placeholder : words.placeholder;
    trigger.classList.toggle('is-placeholder', !select.value);
  }
  function highlight() {
    const options = [...list.querySelectorAll('[role="option"]')];
    options.forEach((option, index) => option.classList.toggle('is-active', index === active));
    if (options[active]) {
      input.setAttribute('aria-activedescendant', options[active].id);
      options[active].scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }
  function draw() {
    filtered = state.categories.filter(category => normalize(category.label).includes(normalize(input.value)));
    list.replaceChildren();
    filtered.forEach((category, index) => {
      const parts = splitCategoryLabel(category.label);
      const spent = state.expenses.filter(expense => expense.categoryId === category.id).reduce((total, expense) => total + expense.amount, 0);
      const option = document.createElement('div');
      option.className = 'category-option';
      option.id = list.id + '-' + index;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(select.value === category.id));
      const icon = document.createElement('span');
      icon.className = 'category-icon';
      icon.textContent = parts.emoji || '◇';
      const copy = document.createElement('span');
      copy.className = 'category-option-copy';
      const name = document.createElement('strong');
      name.textContent = parts.name;
      const detail = document.createElement('small');
      detail.textContent = category.target > 0 ? `${fmt(category.target - spent)} ${currencyUnit()} · ${words.remaining}` : words.noBudget;
      detail.classList.toggle('is-over', category.target > 0 && spent > category.target);
      copy.append(name, detail);
      const check = document.createElement('span');
      check.className = 'category-check';
      check.textContent = select.value === category.id ? '✓' : '';
      option.append(icon, copy, check);
      option.addEventListener('mousedown', event => event.preventDefault());
      option.addEventListener('click', () => choose(category));
      list.append(option);
    });
    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'category-empty';
      empty.textContent = words.empty;
      list.append(empty);
    }
    wrapper.querySelector('.category-count').textContent = `${filtered.length} ${words.count}`;
    active = filtered.findIndex(category => category.id === select.value);
    highlight();
  }
  function close(returnFocus = false) {
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-expanded', 'false');
    if (returnFocus) trigger.focus();
  }
  function choose(category) {
    select.value = category.id;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    updateLabel();
    close(true);
  }
  trigger.addEventListener('click', () => {
    if (!panel.hidden) return close();
    input.value = '';
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-expanded', 'true');
    draw();
    input.focus();
  });
  input.addEventListener('input', draw);
  wrapper.addEventListener('keydown', event => {
    if (panel.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
    if (event.key === 'Tab') close();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      active = filtered.length ? (active + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length : -1;
      highlight();
    }
    if (event.key === 'Enter' && event.target === input) {
      event.preventDefault();
      if (filtered[active]) choose(filtered[active]);
      else if (filtered.length === 1) choose(filtered[0]);
    }
  });
  wrapper.addEventListener('focusout', event => { if (!wrapper.contains(event.relatedTarget)) close(); });
  document.getElementById('modalOverlay').addEventListener('mousedown', event => {
    if (!wrapper.contains(event.target)) close();
  });
  updateLabel();
}

function closeModal() {
  const overlay = document.getElementById("modalOverlay");
  if (overlay) overlay.remove();
}

function deleteCategory(id) {
  const category = state.categories.find((cat) => cat.id === id);
  if (!category) return;
  const count = state.expenses.filter((e) => e.categoryId === id).length;
  if (!confirm(__t("Delete \"{label}\" and its {n} expense(s)? This cannot be undone.", { label: category.label, n: count })))
    return;
  state.categories = state.categories.filter((cat) => cat.id !== id);
  state.expenses = state.expenses.filter((e) => e.categoryId !== id);
  closeModal();
  save();
  render();
}

function openAddBudgetModal() {
  openModal(`
    <div class="section-label" style="margin-bottom:18px;">${esc("Add Budget Category")}</div>
    <input type="text" id="newCatEmoji" placeholder="${esc("Emoji (optional, e.g. 🎮)")}" class="mb-3" maxlength="4">
    <input type="text" id="newCatName" placeholder="${esc("Category name (e.g. Entertainment)")}" class="mb-3">
    <input type="number" id="newCatTarget" placeholder="${esc(`Monthly budget in ${currencyUnit()}`)}" class="mb-5">
    <div style="display:flex;gap:10px;">
      <button class="btn-ghost" style="flex:1;padding:13px;" onclick="closeModal()">${esc("Cancel")}</button>
      <button class="btn-primary" style="flex:1;" onclick="saveNewBudget()">${esc("Add Category")}</button>
    </div>
  `);
}

function openEditBudgetModal(id) {
  const category = state.categories.find((cat) => cat.id === id);
  if (!category) return;
  const parts = splitCategoryLabel(category.label);
  openModal(`
    <div class="modal-kicker">${esc("Budget category")}</div>
    <div class="section-label" style="margin-bottom:8px;">${esc("Edit Budget")}</div>
    <p class="modal-copy">${esc("Change its name, icon, or monthly limit. Existing expenses stay attached.")}</p>
    <label class="field-label" for="editCatEmoji">${esc("Icon")}</label>
    <input type="text" id="editCatEmoji" value="${esc(parts.emoji)}" placeholder="${esc("Optional emoji")}" class="mb-3" maxlength="8">
    <label class="field-label" for="editCatName">${esc("Category name")}</label>
    <input type="text" id="editCatName" value="${esc(parts.name)}" placeholder="${esc("Category name")}" class="mb-3">
    <label class="field-label" for="editCatTarget">${esc(`Monthly limit in ${currencyUnit()}`)}</label>
    <input type="number" id="editCatTarget" value="${category.target}" min="1" step="1" class="mb-5" placeholder="${esc(`Monthly budget in ${currencyUnit()}`)}">
    <div class="modal-actions triple">
      <button type="button" class="btn-ghost btn-danger-ghost" onclick="deleteCategory('${id}')">${esc("🗑️ Delete")}</button>
      <button type="button" class="btn-ghost" onclick="closeModal()">${esc("Cancel")}</button>
      <button type="button" class="btn-primary" onclick="saveEditedBudget('${id}')">${esc("Save changes")}</button>
    </div>
  `);
  setTimeout(() => document.getElementById("editCatName")?.focus(), 0);
}

function openEditIncomeModal(id) {
  if (protectLinkedExpense(id, 'income')) return;
  const inc = state.incomes.find((i) => i.id === id);
  if (!inc) return;
  openModal(`
    <div class="section-label" style="margin-bottom:18px;">${esc("Edit Income")}</div>
    <input type="text" id="editIncomeName" value="${esc(inc.name)}" class="mb-3" placeholder="${esc("Stream name")}">
    <input type="number" id="editIncomeAmount" value="${inc.amount}" class="mb-5" placeholder="${esc(`Amount in ${currencyUnit()}`)}">
    <div class="modal-actions triple">
      <button type="button" class="btn-ghost btn-danger-ghost" onclick="deleteIncome('${id}')">${esc("🗑️ Delete")}</button>
      <button type="button" class="btn-ghost" onclick="closeModal()">${esc("Cancel")}</button>
      <button type="button" class="btn-primary" style="flex:1;" onclick="saveEditedIncome('${id}')">${esc("Save changes")}</button>
    </div>
  `);
}

function openEditExpenseModal(id) {
  if (protectLinkedExpense(id)) return;
  const exp = state.expenses.find((e) => e.id === id);
  if (!exp) return;
  const catOptions = state.categories
    .map(
      (c) =>
        `<option value="${c.id}" ${c.id === exp.categoryId ? "selected" : ""}>${c.label}</option>`,
    )
    .join("");
  openModal(`
    <div class="section-label" style="margin-bottom:18px;">${esc("Edit Expense")}</div>
    <select id="editExpenseCategory" class="mb-3">${catOptions}</select>
    <input type="text" id="editExpenseDesc" value="${esc(exp.desc || "")}" class="mb-3" placeholder="${esc("Description (optional)")}">
    <input type="number" id="editExpenseAmount" value="${exp.amount}" class="mb-5" placeholder="${esc(`Amount in ${currencyUnit()}`)}">
    <div class="modal-actions triple">
      <button type="button" class="btn-ghost btn-danger-ghost" onclick="deleteExpense('${id}')">${esc("🗑️ Delete")}</button>
      <button type="button" class="btn-ghost" onclick="closeModal()">${esc("Cancel")}</button>
      <button type="button" class="btn-primary" style="flex:1;" onclick="saveEditedExpense('${id}')">${esc("Save changes")}</button>
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
  document.querySelectorAll(".reveal").forEach((el) => el.classList.add("in"));
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
      ? emptyStateHtml("coins", "No income streams yet", "Add your first source of income to open the ledger.")
      : state.incomes
          .map(
            (inc) => `
      <div class="fade-in row-item income-stream-row" data-income-id="${esc(inc.id)}" onclick="showContextMenu(event,'income','${inc.id}')">
        <span class="income-stream-name" dir="auto">${esc(inc.name)}</span>
        <span class="num income-stream-amount">${fmt(inc.amount)}</span>
        <button type="button" class="expense-menu-button" aria-label="${esc('Income actions')}" onclick="showContextMenu(event,'income','${inc.id}')">⋯</button>
      </div>`,
          )
          .join("");

  // Transaction table
  const tbody = document.getElementById("txBody");
  const sorted = [...state.expenses].reverse();
  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="padding:0;">${emptyStateHtml(
      "receipt",
      "No expenses logged yet",
      "Log your first expense and it will appear here.",
    )}</td></tr>`;
  } else {
    tbody.innerHTML = sorted
      .map((e) => {
        const cat = state.categories.find((c) => c.id === e.categoryId);
        return `<tr class="fade-in row-item" data-expense-id="${esc(e.id)}" style="border-top:1px solid var(--ink-line);" onclick="showContextMenu(event,'expense','${e.id}')">
        <td style="padding:11px 0;font-size:11px;color:var(--muted);">${cat ? esc(cat.label.substring(0, 14)) : esc(e.categoryId)}</td>
        <td style="padding:11px 4px;font-size:11px;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(e.desc) || "—"}</td>
        <td class="num" style="padding:11px 0;text-align:end;font-size:12px;">${fmt(e.amount)}</td>
        <td style="padding:11px 0;text-align:end;"><button type="button" class="expense-menu-button" aria-label="${esc('Expense actions')}" onclick="showContextMenu(event,'expense','${e.id}')">⋯</button></td>
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
    <div><span>${esc("Monthly plan")}</span><strong class="num">${fmt(totalBudget)}</strong></div>
    <div><span>${esc("Used")}</span><strong class="num">${usedPct}%</strong></div>
    <div><span>${esc(budgetRemaining >= 0 ? "Available" : "Over plan")}</span><strong class="num ${budgetRemaining < 0 ? "is-over" : ""}">${fmt(budgetRemaining)}</strong></div>
  `;
  bt.innerHTML =
    state.categories.length === 0
      ? emptyStateHtml(
          "layout",
          "No budget categories yet",
          "Add a category to start tracking where the money goes.",
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
        <button class="icon-btn" type="button" aria-label="Edit ${esc(cat.label)} budget" title="Edit budget" onclick="openEditBudgetModal('${cat.id}')">${esc("✏️ Edit").replace("✏️ ", "")}</button>
      </div>
      <div class="budget-amount-row">
        <div><span>${esc("Spent")}</span><strong class="num">${fmt(spent)}</strong></div>
        <div><span>${esc(over ? "Over" : "Remaining")}</span><strong class="num">${fmt(remaining)}</strong></div>
      </div>
      <div class="progress-track" role="progressbar" aria-label="${esc(cat.label)} budget usage" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(pctDisplay, 100)}">
        <div class="progress-fill" style="width:${fillPct}%;background:${over ? "var(--rust)" : "var(--jade)"};"></div>
      </div>
      ${over ? `<div style="display:flex;justify-content:flex-end;margin-top:9px;"><span class="tag tag-rust">${esc(__t("↑ {amount} over", { amount: fmt(ovBy) }))}</span></div>` : ""}
      <div class="budget-item-foot"><span>${pctDisplay}% ${esc("used")}</span><span class="num">${fmt(cat.target)} ${esc("limit")}</span></div>
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
    "No income to break down",
    "Income streams appear here as a donut once you add them.",
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
        animation: false,
        responsive: true,
        maintainAspectRatio: true,
        cutout: "68%",
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: v("--chart-label"),
              font: { family: "Inter", size: 11 },
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
            titleFont: { family: "Inter", weight: "600" },
            bodyFont: { family: "JetBrains Mono" },
            callbacks: {
              label: (ctx) =>
                ` ${ctx.label}: ${ctx.raw.toLocaleString()} ${currencyUnit()}`,
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
    "Nothing spent yet",
    "Log an expense to see spending by category.",
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
            label: "Spent",
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
            label: "Budget",
            data: catTotals.map((c) => c.target),
            backgroundColor: v("--chart-bar-dim"),
            borderRadius: 3,
            borderSkipped: false,
            barThickness: 16,
          },
        ],
      },
      options: {
        animation: false,
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: v("--chart-label"),
              font: { family: "Inter", size: 11 },
              usePointStyle: true,
              pointStyle: "rect",
            },
          },
          tooltip: {
            backgroundColor: v("--chart-tip-bg"),
            borderColor: v("--chart-tip-border"),
            borderWidth: 1,
            padding: 12,
            titleFont: { family: "Inter", weight: "600" },
            bodyFont: { family: "JetBrains Mono" },
            callbacks: {
              label: (ctx) =>
                ` ${ctx.dataset.label}: ${ctx.raw.toLocaleString()} ${currencyUnit()}`,
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
              font: { size: 11, family: "Inter" },
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
// Adopt atomic payment results and changes from other workspaces without writing
// an old in-memory ledger back over the newly committed expense.
addEventListener('app-storage-change', () => {
  try {
    const incoming = JSON.parse(appStorage.getItem(PERIODS_STORAGE_KEY) || 'null');
    if (!incoming || !Object.keys(incoming).length) return;
    const selected = appStorage.getItem(ACTIVE_PERIOD_KEY) || activePeriod;
    if (JSON.stringify(incoming) === JSON.stringify(periods) && selected === activePeriod && currencyUnit() === renderedUnit) return;
    renderedUnit = currencyUnit();
    periods = incoming;
    activePeriod = periods[selected] ? selected : Object.keys(periods)[0];
    state = cloneState(normalizeState(periods[activePeriod]));
    render();
  } catch { showToast('Unable to refresh the ledger. Reload before editing.', 'error'); }
});
