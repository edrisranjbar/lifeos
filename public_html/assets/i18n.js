// Interface language chosen in Settings, stored per account. Strings are keyed by
// their English text; English needs no dictionary. Load right after storage.js:
// this wraps window.appStorageReady so apps that await it render translated.
(() => {
  const KEY = 'edi_language_v1';
  // Per-device hint so the first paint already has the right direction.
  const HINT = 'lifeos-language';
  const VERSION = 'persian-1';
  const LANGUAGES = [
    { code: 'en', name: 'English', dir: 'ltr', locale: null },
    { code: 'fa', name: 'فارسی', dir: 'rtl', locale: 'fa-IR-u-ca-gregory' },
    { code: 'ar', name: 'العربية', dir: 'rtl', locale: 'ar-u-nu-arab-ca-gregory' },
  ];
  const find = code => LANGUAGES.find(language => language.code === code) || LANGUAGES[0];
  const root = document.documentElement;
  let current = LANGUAGES[0];
  let dictionary = {};

  function use(code) {
    current = find(code);
    root.lang = current.code;
    root.dir = current.dir;
  }
  try { use(localStorage.getItem(HINT)); } catch { /* Storage may be unavailable. */ }

  function t(text, vars) {
    const key = String(text).replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    let out = Object.prototype.hasOwnProperty.call(dictionary, key) ? dictionary[key] : text;
    if (vars) out = out.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
    return out;
  }

  // Locale for Intl; English keeps whatever locale each call site used before.
  const locale = (english = 'en-US') => current.locale || english;
  const number = (value, options, english) => new Intl.NumberFormat(locale(english), options).format(value);
  const date = (value, options, english) => new Intl.DateTimeFormat(locale(english), options).format(value);
  // Replace Latin digits in already-built strings such as "25:00".
  const digits = text => {
    if (current.code === 'en') return String(text);
    const zero = current.code === 'fa' ? 0x06F0 : 0x0660;
    return String(text).replace(/[0-9]/g, digit => String.fromCharCode(zero + Number(digit)));
  };

  const SKIP = 'script,style,textarea,code,pre,[contenteditable],[data-i18n-skip]';
  const ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt'];
  // Translate static markup once; dynamic text goes through t() in each app.
  function apply(scope = document) {
    if (current.code === 'en') return;
    const base = scope.nodeType === Node.DOCUMENT_NODE ? scope.documentElement : scope;
    const walker = document.createTreeWalker(base, NodeFilter.SHOW_TEXT, {
      acceptNode: node => (node.parentElement?.closest(SKIP + ',[dir=auto]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.nodeValue.trim();
      const key = text.replace(/\s+/g, ' ');
      if (!text || !Object.prototype.hasOwnProperty.call(dictionary, key)) continue;
      node.nodeValue = node.nodeValue.replace(text, dictionary[key]);
    }
    const elements = [base, ...base.querySelectorAll(ATTRIBUTES.map(name => `[${name}]`).join(','))];
    for (const element of elements) {
      if (element.closest?.(SKIP)) continue;
      for (const name of ATTRIBUTES) {
        const value = element.getAttribute?.(name);
        const key = value?.replace(/\s+/g, ' ').trim();
        if (key && Object.prototype.hasOwnProperty.call(dictionary, key)) element.setAttribute(name, dictionary[key]);
      }
    }
  }

  // Only use with app-owned static markup. User text is interpolated separately
  // by callers and is never passed through the translation dictionary.
  function markup(source) {
    const template = document.createElement('template');
    template.innerHTML = source;
    apply(template.content);
    return template.innerHTML;
  }

  function addFont() {
    if (current.dir !== 'rtl' || document.getElementById('lifeos-rtl-font')) return;
    const link = Object.assign(document.createElement('link'), {
      id: 'lifeos-rtl-font', rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300..800&display=swap',
    });
    const style = document.createElement('style');
    // Inter and the display fonts have no Persian or Arabic letters.
    style.textContent = 'html[dir=rtl] *:not(svg):not(svg *){font-family:Vazirmatn,Tahoma,"Segoe UI",sans-serif!important;letter-spacing:normal!important}';
    document.head.append(link, style);
  }

  async function load() {
    let code = 'en';
    try { code = window.appStorage?.getItem(KEY) || 'en'; } catch { /* Fall back to English. */ }
    use(code);
    try { localStorage.setItem(HINT, current.code); } catch { /* Storage may be unavailable. */ }
    if (current.code !== 'en') {
      try {
        const response = await fetch(`/assets/i18n/${current.code}.json?v=${VERSION}`, { cache: 'no-store', redirect: 'error' });
        if (!response.ok) throw new Error(`Dictionary ${current.code} returned ${response.status}`);
        dictionary = await response.json();
      } catch (error) {
        console.error(error);
        dictionary = {};
      }
    }
    if (document.readyState === 'loading') await new Promise(resolve => addEventListener('DOMContentLoaded', resolve, { once: true }));
    addFont();
    apply(document);
  }

  window.lifeOsI18n = { KEY, languages: LANGUAGES, lang: () => current.code, dir: () => current.dir, t, locale, number, date, digits, apply, markup };
  if (window.appStorageReady) window.appStorageReady = window.appStorageReady.then(load);

  // A language change from Settings, another tab or another device reloads the
  // whole workspace; frames inside the shell reload with it.
  addEventListener('app-storage-change', () => {
    let code;
    try { code = window.appStorage.getItem(KEY) || 'en'; } catch { return; }
    if (find(code).code !== current.code && window.top === window) location.reload();
  });
})();
