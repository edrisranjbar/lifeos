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
  return window.lifeOsI18n.t(str, vars);
}
let periods = {};
let activePeriod = "Current";

// Unit label from the currency chosen in Settings (amounts are never converted).
const currencyUnit = () => window.lifeOsCurrency?.unit() ?? "Toman";
let renderedUnit = currencyUnit();

const budgetIsUnlimited = category => category?.unlimited === true;
function financeBudgetTotals(ledger = state) {
  const categories = ledger.categories || [];
  const unlimited = new Set(categories.filter(budgetIsUnlimited).map(category => category.id));
  const total = categories.filter(category => !budgetIsUnlimited(category)).reduce((sum, category) => sum + (Number(category.target) || 0), 0);
  const spent = (ledger.expenses || []).filter(expense => !unlimited.has(expense.categoryId)).reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
  const unlimitedSpent = (ledger.expenses || []).filter(expense => unlimited.has(expense.categoryId)).reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
  return {total, spent, remaining: total - spent, unlimitedSpent, unlimitedCount: unlimited.size, limitedCount: categories.length - unlimited.size};
}

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
  // Open the new Persian month once; later visits preserve history selection.
  const month = currentFinanceMonth();
  const existing = findFinanceMonth(month);
  if (!existing) {
    const name = financeMonthName(month);
    periods[name] = newFinancePeriod(month);
    activePeriod = name;
    state = cloneState(periods[name]);
  }
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
    .join("") + '<option value="" disabled>────────</option><option value="__create_period__">' + esc(__t('Create period…')) + '</option>';
}

const FINANCE_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
function currentFinanceMonth() {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', {timeZone: 'Asia/Tehran', year: 'numeric', month: 'numeric'}).formatToParts(new Date());
  return {year: Number(parts.find(p => p.type === 'year').value), month: Number(parts.find(p => p.type === 'month').value)};
}
function financeMonthName(month) { return `${FINANCE_MONTHS[month.month - 1]} ${month.year}`; }
function findFinanceMonth(month) {
  return Object.keys(periods).find(name => {
    const saved = periods[name]?.calendarPeriod;
    return name === financeMonthName(month) || (saved?.calendar === 'persian' && saved.year === month.year && saved.month === month.month);
  });
}
function newFinancePeriod(month) {
  const next = freshState();
  next.categories = cloneState(state.categories);
  next.calendarPeriod = {calendar: 'persian', ...month};
  return next;
}
function selectFinancePeriod(name) {
  if (name !== '__create_period__') { switchPeriod(name); return; }
  renderPeriodSelector();
  const today = currentFinanceMonth();
  const answer = prompt(__t('Enter a Persian month as YYYY/MM (for example 1405/08).'), `${today.year}/${String(today.month).padStart(2, '0')}`);
  if (answer === null) return;
  const normalized = answer.replace(/[۰-۹]/g, c => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[٠-٩]/g, c => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
  const match = normalized.trim().match(/^(\d{4})\/(\d{1,2})$/);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) {
    showToast(__t('Enter a valid Persian year and month.'), 'error'); return;
  }
  openFinanceMonth({year: Number(match[1]), month: Number(match[2])});
}
function openFinanceMonth(month) {
  save();
  const existing = findFinanceMonth(month);
  const target = existing || financeMonthName(month);
  if (!existing) periods[target] = newFinancePeriod(month);
  activePeriod = target;
  state = cloneState(normalizeState(periods[target]));
  save(); render(); pulseMain();
  if (!existing) showToast(__t('New period "{period}" created.', {period: target}), 'success');
}

function clearAllData() {
  if (!confirm(__t("Reset all data in \"{period}\" to defaults?", { period: activePeriod }))) return;
  closeModal();
  state = freshState();
  save();
  render();
}

// ── PERSIAN MONTH NAVIGATION ────────────────────────────────────────────────
function gotoPeriod(delta) {
  const base = state.calendarPeriod?.calendar === 'persian' ? state.calendarPeriod : currentFinanceMonth();
  const offset = base.year * 12 + base.month - 1 + delta;
  openFinanceMonth({year: Math.floor(offset / 12), month: ((offset % 12) + 12) % 12 + 1});
}
