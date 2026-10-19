export function mountMobileNavigation() {
  const header = document.querySelector('.os-nav');
  const nav = header.querySelector('nav');
  const theme = document.getElementById('theme');
  const marker = document.createComment('Desktop navigation position');
  nav.before(marker);
  nav.id = 'app-navigation';

  const pageName = document.createElement('span');
  pageName.className = 'mobile-page-name';
  header.insertBefore(pageName, theme);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'mobile-menu-toggle';
  toggle.setAttribute('aria-label', 'Open navigation');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'mobile-navigation');
  toggle.innerHTML = '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
  header.append(toggle);

  const dialog = document.createElement('dialog');
  dialog.id = 'mobile-navigation';
  dialog.className = 'mobile-menu';
  dialog.setAttribute('aria-labelledby', 'mobile-menu-title');
  dialog.innerHTML = '<div class="mobile-menu-heading"><div><span class="mobile-menu-kicker">EDI LIFE OS</span><h2 id="mobile-menu-title">Your workspace</h2></div><button type="button" class="mobile-menu-close" aria-label="Close navigation"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>';
  document.body.append(dialog);
  // Built after the page-wide pass, so translate the menu and toggle here.
  window.lifeOsI18n.apply(dialog); window.lifeOsI18n.apply(toggle);
  const mobile = matchMedia('(max-width: 900px)');
  let previousOverflow = '';
  const close = () => { if (dialog.open) dialog.close(); };
  const updatePageName = () => {
    const names = { dashboard: 'Overview', growth: 'Growth', focus: 'Focus', finance: 'Finance', habittify: 'Habittify', kanban: 'Kanban', calendar: 'Calendar', goals: 'Goals', notepad: 'Notepad', notes: 'Notes', settings: 'Settings' };
    pageName.textContent = window.lifeOsI18n.t(names[location.hash.slice(1)] || 'Overview');
  };
  const syncLayout = () => {
    close();
    if (mobile.matches) dialog.append(nav);
    else marker.after(nav);
  };
  toggle.addEventListener('click', () => {
    if (!mobile.matches) return;
    previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    dialog.showModal();
    toggle.setAttribute('aria-expanded', 'true');
    (nav.querySelector('[aria-current="page"]') || nav.querySelector('a'))?.focus();
  });
  dialog.querySelector('.mobile-menu-close').addEventListener('click', close);
  dialog.addEventListener('click', event => {
    if (event.target === dialog) {
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close();
    }
  });
  nav.addEventListener('click', event => { if (event.target.closest('a')) close(); });
  dialog.addEventListener('close', () => {
    document.documentElement.style.overflow = previousOverflow;
    toggle.setAttribute('aria-expanded', 'false');
  });
  window.addEventListener('hashchange', () => { close(); updatePageName(); });
  mobile.addEventListener('change', syncLayout);
  syncLayout();
  updatePageName();
}
