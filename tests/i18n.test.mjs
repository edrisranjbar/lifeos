import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {collectKeys, dictionaryPath, placeholders} from './i18n-keys.mjs';

const LANGUAGES = ['fa', 'ar'];
const keys = collectKeys();
const read = code => JSON.parse(fs.readFileSync(dictionaryPath(code), 'utf8'));

// `I18N_DUMP=fa node tests/i18n.test.mjs` prints the keys still missing from fa.json.
if (process.env.I18N_DUMP) {
  const dictionary = fs.existsSync(dictionaryPath(process.env.I18N_DUMP)) ? read(process.env.I18N_DUMP) : {};
  const missing = Object.fromEntries([...keys].filter(([key]) => !(key in dictionary)));
  console.log(JSON.stringify(missing, null, 1));
}

for (const code of LANGUAGES) {
  test(`${code}: every interface string has a translation`, () => {
    const dictionary = read(code);
    const missing = [...keys].filter(([key]) => typeof dictionary[key] !== 'string' || !dictionary[key].trim()).map(([key, file]) => `${file}: ${key}`);
    assert.deepEqual(missing, [], `${missing.length} missing ${code} translations`);
  });

  test(`${code}: translations keep the same {placeholders}`, () => {
    const dictionary = read(code);
    const broken = Object.entries(dictionary).filter(([key, value]) => placeholders(key).join() !== placeholders(value).join()).map(([key]) => key);
    assert.deepEqual(broken, []);
  });
}

test('both dictionaries cover the same keys', () => {
  assert.deepEqual(Object.keys(read('fa')).sort(), Object.keys(read('ar')).sort());
});

test('t() substitutes values and falls back to English', () => {
  const storage = new Map([['lifeos-language', 'fa']]);
  const context = vm.createContext({
    document: {documentElement: {}, readyState: 'complete'},
    localStorage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)},
    addEventListener() {}, Intl, Node: {DOCUMENT_NODE: 9}, console,
  });
  context.window = context;
  vm.runInContext(fs.readFileSync(new URL('../public_html/assets/i18n.js', import.meta.url), 'utf8'), context);
  const i18n = context.lifeOsI18n;
  assert.equal(i18n.lang(), 'fa');
  assert.equal(context.document.documentElement.dir, 'rtl');
  assert.equal(i18n.t('{count} soon', {count: '3'}), '3 soon');
  assert.equal(i18n.digits('25:00'), '۲۵:۰۰');
});
