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
    <div class="section-label" style="margin-bottom:22px;">${esc(window.lifeOsI18n.t("Settings"))}</div>

    <label class="field-label">${esc(window.lifeOsI18n.t("Appearance"))}</label>
    <div class="seg mb-4" role="group" aria-label="${esc(window.lifeOsI18n.t("Appearance"))}">
      <button type="button" class="seg-btn${currentTheme() === "dark" ? " active" : ""}" onclick="setAppTheme('dark')">
        ${THEME_ICONS.moon}<span>${esc(window.lifeOsI18n.t("Dark"))}</span>
      </button>
      <button type="button" class="seg-btn${currentTheme() === "light" ? " active" : ""}" onclick="setAppTheme('light')">
        ${THEME_ICONS.sun}<span>${esc(window.lifeOsI18n.t("Light"))}</span>
      </button>
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
