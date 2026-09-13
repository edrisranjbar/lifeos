// One-shot transform: replace t() calls in script.js with English strings,
// preserving the {var} substitution by emitting __t("string", {vars}) which
// is implemented inline.
const fs = require('fs');
const path = require('path');

const ROOT = 'C:/Users/edi/Documents/ChatGPT/Edi Life OS';
const enMap = JSON.parse(fs.readFileSync(path.join(ROOT, '_en_map.json'), 'utf8'));

const esc = (s) =>
  s.replace(/\\/g, '\\\\')
   .replace(/'/g, "\\'")
   .replace(/"/g, '\\"')
   .replace(/\n/g, '\\n')
   .replace(/\r/g, '\\r')
   .replace(/\$/g, '\\$');

let script = fs.readFileSync(path.join(ROOT, 'public_html/finance/assets/scripts/script.js'), 'utf8');

// t("key", {vars})  /  t('key', {vars})
script = script.replace(/t\(\s*"([a-zA-Z0-9_]+)"\s*,\s*\{([\s\S]*?)\}\s*\)/g,
  (m, key, vars) => enMap[key] != null ? `__t("${esc(enMap[key])}", {${vars}})` : m);

// t("key")
script = script.replace(/t\(\s*"([a-zA-Z0-9_]+)"\s*\)/g,
  (m, key) => enMap[key] != null ? `"${esc(enMap[key])}"` : m);

// t('key', {vars})
script = script.replace(/t\(\s*'([a-zA-Z0-9_]+)'\s*,\s*\{([\s\S]*?)\}\s*\)/g,
  (m, key, vars) => enMap[key] != null ? `__t("${esc(enMap[key])}", {${vars}})` : m);

// t('key')
script = script.replace(/t\(\s*'([a-zA-Z0-9_]+)'\s*\)/g,
  (m, key) => enMap[key] != null ? `"${esc(enMap[key])}"` : m);

fs.writeFileSync(path.join(ROOT, '_script_step1.js'), script);
console.log('Remaining t( calls:', (script.match(/\bt\(/g) || []).length);
console.log('Inserted __t( calls:', (script.match(/__t\(/g) || []).length);
