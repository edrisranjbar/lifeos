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
  } catch { showToast(window.lifeOsI18n.t('Unable to refresh the ledger. Reload before editing.'), 'error'); }
});
