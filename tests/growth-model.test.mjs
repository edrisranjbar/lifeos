import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {};
const { addDays, nextReview, today } = await import('../public_html/assets/growth-model.js');
const review = (cadence, date) => ({ cadence, date });
test('adding a day moves past the end of a month',()=>assert.equal(addDays('2026-01-31',1),'2026-02-01'));
test('adding a day moves past the end of a year',()=>assert.equal(addDays('2026-12-31',1),'2027-01-01'));
test('the leap day is reached and left correctly',()=>{assert.equal(addDays('2028-02-28',1),'2028-02-29');assert.equal(addDays('2028-02-29',1),'2028-03-01')});
test('adding a day skips February 29th in a non-leap year',()=>assert.equal(addDays('2026-02-28',1),'2026-03-01'));
test('a negative count goes backwards',()=>assert.equal(addDays('2026-03-01',-1),'2026-02-28'));
test('a weekly review is due 7 days after the last one',()=>assert.equal(nextReview({reviews:[review('weekly','2026-01-01')]},'weekly'),'2026-01-08'));
test('a monthly review is due 30 days after the last one',()=>assert.equal(nextReview({reviews:[review('monthly','2026-01-01')]},'monthly'),'2026-01-31'));
test('a quarterly review is due 90 days after the last one',()=>assert.equal(nextReview({reviews:[review('quarterly','2026-01-01')]},'quarterly'),'2026-04-01'));
test('monthly means 30 days, not a calendar month',()=>assert.equal(nextReview({reviews:[review('monthly','2026-01-31')]},'monthly'),'2026-03-02'));
test('the newest review counts, whatever the order of the list',()=>assert.equal(nextReview({reviews:[review('weekly','2026-01-08'),review('weekly','2026-01-22'),review('weekly','2026-01-01')]},'weekly'),'2026-01-29'));
test('reviews of other cadences are ignored',()=>assert.equal(nextReview({reviews:[review('weekly','2026-01-01'),review('monthly','2026-02-01')]},'weekly'),'2026-01-08'));
test('a cadence with no review yet is due today',()=>assert.equal(nextReview({reviews:[review('monthly','2026-01-01')]},'weekly'),today()));
test('no reviews at all is due today',()=>assert.equal(nextReview({reviews:[]},'weekly'),today()));
