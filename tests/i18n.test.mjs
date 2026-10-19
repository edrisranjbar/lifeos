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

test('Persian dictionary loads before application readiness and translates labels and placeholders', async () => {
  const attributes = new Map([['placeholder', 'Search notes']]);
  const input = {closest: () => null, getAttribute: name => attributes.get(name), setAttribute: (name, value) => attributes.set(name, value)};
  const root = {closest: () => null, querySelectorAll: () => [input]};
  const nodes = [{nodeValue: '  Settings  ', parentElement: {closest: () => null}}];
  let index = -1;
  const requests = [];
  const context = vm.createContext({
    document: {documentElement: root, nodeType: 9, readyState: 'complete',
      getElementById: () => ({}), createTreeWalker: () => ({nextNode: () => nodes[++index] || null})},
    localStorage: {getItem: () => null, setItem() {}},
    appStorage: {getItem: () => 'fa'}, appStorageReady: Promise.resolve(),
    fetch: async (url, options) => { requests.push([url, options.redirect]); return {ok: true, json: async () => read('fa')}; },
    addEventListener() {}, Intl, Node: {DOCUMENT_NODE: 9},
    NodeFilter: {SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1}, console,
  });
  context.window = context;
  vm.runInContext(fs.readFileSync(new URL('../public_html/assets/i18n.js', import.meta.url), 'utf8'), context);
  await context.appStorageReady;
  assert.match(requests[0][0], /^\/assets\/i18n\/fa\.json\?v=/);
  assert.equal(requests[0][1], 'error');
  assert.equal(root.lang, 'fa');
  assert.equal(root.dir, 'rtl');
  assert.equal(nodes[0].nodeValue, '  تنظیمات  ');
  assert.equal(attributes.get('placeholder'), 'جستجوی یادداشت‌ها');
  assert.equal(context.lifeOsI18n.t('  Save\n changes '), 'ذخیره تغییرات');
  assert.equal(context.lifeOsI18n.t('DEBTS &amp; CREDITS'), 'بدهی‌ها و طلب‌ها');
  assert.equal(context.lifeOsI18n.t('Signed in as {name}', {name: 'Save'}), 'واردشده با نام Save');
  assert.equal(context.lifeOsI18n.t('Unknown custom title'), 'Unknown custom title');
});
