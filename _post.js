// Post-process: finalize the i18n removal in script.js
const fs = require('fs');
const path = require('path');

const ROOT = 'C:/Users/edi/Documents/ChatGPT/Edi Life OS';
let s = fs.readFileSync(path.join(ROOT, '_script_step1.js'), 'utf8');

// 1) Replace uiFont() with "Inter" (the default English font)
s = s.replace(/uiFont\(\)/g, '"Inter"');

// 2) Add a __t helper near the top (after state declarations, before usage).
//    __t(str, vars) returns str with {var} tokens replaced, matching the
//    original t() behavior. Insert it just after the first `let state = {`.
const helper = `
// ── Tiny template helper (replaces former t() with {var} interpolation) ──
function __t(str, vars) {
  if (!vars) return str;
  return str.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
`;
s = s.replace(/(let state = \{[\s\S]*?\};\n)/, `$1${helper}`);

// 3) Strip the openSettingsModal + setAppTheme + setAppLang block
//    (lines around 277–320 in the original; now offset by the helper we added)
const settingsBlockRe = /\/\/ ── SETTINGS MODAL[\s\S]*?^function toggleLang\(\) \{[\s\S]*?\n\}\n/m;
s = s.replace(settingsBlockRe, '');

// Also remove the trailing IIFE that initialized language on load (the
// (function () { ... setLang(...) ... })() at the bottom of i18n.js was the
// only place setLang() ran on load — script.js never called it).
// Already removed by stripping the i18n.js file itself; nothing to do here.

// 4) Save the final script.
fs.writeFileSync(path.join(ROOT, 'public_html/finance/assets/scripts/script.js'), s);
console.log('script.js rewritten.');
console.log('__t remaining:', (s.match(/__t\(/g) || []).length);
console.log('uiFont remaining:', (s.match(/uiFont/g) || []).length);
console.log('openSettingsModal remaining:', (s.match(/openSettingsModal/g) || []).length);
console.log('setAppTheme remaining:', (s.match(/setAppTheme/g) || []).length);
console.log('setAppLang remaining:', (s.match(/setAppLang/g) || []).length);
console.log('currentLang remaining:', (s.match(/currentLang/g) || []).length);
