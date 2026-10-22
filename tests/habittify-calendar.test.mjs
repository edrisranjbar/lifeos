import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function calendar(saved) {
  const values = new Map(saved ? [['edi_calendar_v1', saved]] : []);
  const ctx = vm.createContext({
    window: {lifeOsI18n: {
      t: (s, vars = {}) => s.replace(/\{(\w+)\}/g, (_, key) => String(vars[key])),
      number: (n, opts) => new Intl.NumberFormat('en-US', opts).format(n),
    }},
    appStorage: {getItem: key => values.get(key) ?? null},
  });
  vm.runInContext(fs.readFileSync(new URL('../public_html/assets/html-escape.js', import.meta.url), 'utf8'), ctx);
  const source = fs.readFileSync(new URL('../public_html/habittify/static/app.js', import.meta.url), 'utf8');
  vm.runInContext(source.slice(0, source.lastIndexOf('window.appStorageReady')), ctx);
  vm.runInContext('state.calendar = readCalendar()', ctx);
  return expression => JSON.parse(JSON.stringify(vm.runInContext(expression, ctx)));
}

test('saved preference chooses calendar and Gregorian is the default', () => {
  assert.equal(calendar()('state.calendar'), 'gregorian');
  assert.equal(calendar('invalid')('state.calendar'), 'gregorian');
  assert.equal(calendar('jalali')('state.calendar'), 'jalali');
  assert.equal(calendar('gregorian')('state.calendar'), 'gregorian');
});

test('Nowruz and Gregorian leap days retain their actual ISO log dates', () => {
  const jalali = calendar('jalali');
  assert.deepEqual(jalali('monthOf(new Date(2026, 2, 21))'), {y:1405, m:1});
  const farvardin = jalali('monthDays({y:1405, m:1})');
  assert.equal(farvardin.length, 31);
  assert.equal(farvardin[0].iso, '2026-03-21');
  assert.equal(jalali('dayLabel(new Date(2026, 2, 21))'), '1 Farvardin 1405');
  const gregorian = calendar('gregorian');
  const leap = gregorian('monthDays({y:2024, m:2})');
  assert.equal(leap.length, 29);
  assert.equal(leap.at(-1).iso, '2024-02-29');
  assert.equal(gregorian('monthDays({y:2025, m:2}).length'), 28);
  assert.equal(gregorian('dayLabel(new Date(2026, 2, 21))'), '21 March 2026');
});

test('both calendars cross year boundaries without changing month length rules', () => {
  for (const saved of ['jalali', 'gregorian']) {
    const run = calendar(saved);
    assert.deepEqual(run('shiftMonth({y:1404, m:12}, 1)'), {y:1405, m:1});
    assert.deepEqual(run('shiftMonth({y:2026, m:1}, -1)'), {y:2025, m:12});
  }
});
