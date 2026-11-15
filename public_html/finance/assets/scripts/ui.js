// ── FORMAT ────────────────────────────────────────────────────────────────────
function fmt(n) {
  return window.lifeOsI18n.number(Math.abs(n));
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
const esc = globalThis.lifeOsHtml.escapeHtml;

const EMPTY_ICONS = {
  coins: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/></svg>`,
  receipt: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/></svg>`,
  layout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>`,
};

// ── CATEGORY ICONS (SVG, replaces emoji glyphs) ──────────────────────────────
const CATEGORY_ICON_PATHS = {
  cart: '<circle cx="9" cy="20" r="1.6"/><circle cx="17" cy="20" r="1.6"/><path d="M3 3h2l2.4 12.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
  wallet: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
  car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9-1.8-.5-4.5-1.1-4.5-1.1s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
  bank: '<path d="m3 9 9-6 9 6v1H3z"/><path d="M5 10v10M9.5 10v10M14.5 10v10M19 10v10"/><path d="M3 20h18"/>',
  wifi: '<path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 15.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="19" r="1"/>',
  shirt: '<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  pill: '<path d="M10.5 20.5a4.95 4.95 0 1 1-7-7l6-6a4.95 4.95 0 1 1 7 7Z"/><path d="m8.5 8.5 7 7"/>',
  tag: '<path d="M3 3h8l10 10-8 8L3 11z"/><circle cx="8" cy="8" r="1.5"/>',
};
const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICON_PATHS);

// Default categories map onto fixed icons; anything else is matched by name.
const CATEGORY_ICON_BY_ID = {
  food: "cart", family: "users", housing: "home", work: "briefcase",
  project: "code", saving: "wallet", transport: "car", loans: "bank",
  bills: "wifi", clothing: "shirt", charity: "heart", health: "pill",
};
const CATEGORY_ICON_RULES = [
  [/food|drink|grocer|cafe|restaurant|snack|غذا|خوراک|خواربار|میوه|رستوران|کافه/, "cart"],
  [/famil|kid|child|home care|خانواده|فرزند|بچه/, "users"],
  [/hous|rent|mortgage|home|building|construct|اجاره|خانه|مسکن|ساخت/, "home"],
  [/work|career|growth|course|book|کار|شغل|رشد|کتاب|دوره/, "briefcase"],
  [/project|software|tool|host|domain|پروژه|نرم|هاست|دامنه/, "code"],
  [/sav|invest|fund|پس‌انداز|سرمایه|صندوق|ذخیره/, "wallet"],
  [/transport|fuel|gas|taxi|bus|train|car|حمل|سوخت|تاکسی|اتوبوس|قطار|خودرو|ماشین/, "car"],
  [/loan|debt|installment|bank|credit|وام|اقساط|بانک|بدهی|قرض/, "bank"],
  [/bill|internet|vpn|phone|mobile|utility|قبض|اینترنت|تلفن|موبایل|شارژ/, "wifi"],
  [/cloth|wear|shirt|پوشاک|لباس|کفش/, "shirt"],
  [/charit|donat|zakat|khums|خیریه|صدقه|کمک|زکات|خمس/, "heart"],
  [/health|medic|doctor|pharma|dentist|سلامت|دارو|پزشک|دندان|درمان/, "pill"],
];

function iconSvg(paths, size = 14) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

// Shared UI glyphs (edit / trash) used outside the category set.
const UI_ICON_PATHS = {
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 8 5-5 5 5"/><path d="M12 3v12"/>',
};

function categoryIconKey(category) {
  if (category?.icon && CATEGORY_ICON_PATHS[category.icon]) return category.icon;
  const byId = CATEGORY_ICON_BY_ID[category?.id];
  if (byId) return byId;
  const name = String(splitCategoryLabel(category?.label).name || category?.id || "").toLowerCase();
  for (const [pattern, icon] of CATEGORY_ICON_RULES) if (pattern.test(name)) return icon;
  return "tag";
}

function categoryIcon(category, size = 14) {
  return iconSvg(CATEGORY_ICON_PATHS[categoryIconKey(category)], size);
}

// Radio-style icon chooser for the category modals.
function categoryIconPickerHtml(prefix, selected = "tag") {
  const options = CATEGORY_ICON_NAMES.map((key) => `
    <button type="button" class="icon-choice${key === selected ? " is-selected" : ""}" data-icon="${key}"
      role="radio" aria-checked="${key === selected}" title="${esc(window.lifeOsI18n.t(ICON_LABELS[key] || key))}"
      onclick="pickCategoryIcon(this,'${prefix}')">${iconSvg(CATEGORY_ICON_PATHS[key], 16)}</button>`).join("");
  return `<div class="icon-picker" role="radiogroup" aria-label="${esc(window.lifeOsI18n.t("Icon"))}">${options}</div><input type="hidden" id="${prefix}Icon" value="${selected}">`;
}

const ICON_LABELS = {
  cart: "Cart", users: "People", home: "Home", briefcase: "Work", code: "Project",
  wallet: "Savings", car: "Transport", bank: "Loans", wifi: "Bills", shirt: "Clothing",
  heart: "Charity", pill: "Health", tag: "Other",
};

function pickCategoryIcon(button, prefix) {
  button.closest(".icon-picker").querySelectorAll(".icon-choice").forEach((el) => {
    const on = el === button;
    el.classList.toggle("is-selected", on);
    el.setAttribute("aria-checked", String(on));
  });
  document.getElementById(`${prefix}Icon`).value = button.dataset.icon;
}

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
      normalized === "dark" ? window.lifeOsI18n.t("Switch to light mode") : window.lifeOsI18n.t("Switch to dark mode"),
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
    <div class="modal-kicker">${esc(window.lifeOsI18n.t("Preferences"))}</div>
    <div class="modal-title">${esc(window.lifeOsI18n.t("Settings"))}</div>
    <div class="settings-section" style="margin-top:20px;">
      <span class="field-label">${esc(window.lifeOsI18n.t("Appearance"))}</span>
      <div class="seg" role="group" aria-label="${esc(window.lifeOsI18n.t("Appearance"))}">
        <button type="button" class="seg-btn${currentTheme() === "dark" ? " active" : ""}" onclick="setAppTheme('dark')">
          ${THEME_ICONS.moon}<span>${esc(window.lifeOsI18n.t("Dark"))}</span>
        </button>
        <button type="button" class="seg-btn${currentTheme() === "light" ? " active" : ""}" onclick="setAppTheme('light')">
          ${THEME_ICONS.sun}<span>${esc(window.lifeOsI18n.t("Light"))}</span>
        </button>
      </div>
    </div>

    <div class="danger-zone">
      <div class="danger-copy">
        <strong>${esc(window.lifeOsI18n.t("Reset all data"))}</strong>
        <p>${esc(__t("Every income stream, expense and budget in \"{period}\" will be wiped and replaced with defaults. This cannot be undone.", { period: activePeriod }))}</p>
      </div>
      <button class="btn-danger-solid" onclick="clearAllData()">${esc(window.lifeOsI18n.t("Reset period data"))}</button>
    </div>
  `);
}

function setAppTheme(value) {
  setTheme(value);
  openSettingsModal(); // refresh active states
}
