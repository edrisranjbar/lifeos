import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {};
globalThis.appStorage = { getItem() { return null; } };

const { addDays, nextReview, today, cadenceDays } = await import('../public_html/assets/growth-model.js');

test('addDays calculates dates accurately across intervals', () => {
  assert.equal(addDays('2026-01-01', 7), '2026-01-08');
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29'); // Leap day
  assert.equal(addDays('2026-01-05', -4), '2026-01-01');
});

test('nextReview calculates next review date for known cadences', () => {
  const doc = {
    reviews: [
      { cadence: 'weekly', date: '2026-01-01' },
      { cadence: 'weekly', date: '2026-01-10' },
      { cadence: 'monthly', date: '2026-01-05' }
    ]
  };

  // Uses latest review date (2026-01-10 + 7 days = 2026-01-17)
  assert.equal(nextReview(doc, 'weekly'), '2026-01-17');
  // Monthly: 2026-01-05 + 30 days = 2026-02-04
  assert.equal(nextReview(doc, 'monthly'), '2026-02-04');
  // Quarterly has no reviews recorded, defaults to today()
  assert.equal(nextReview(doc, 'quarterly'), today());
});

test('nextReview returns null for unknown cadences without throwing', () => {
  const doc = {
    reviews: [
      { cadence: 'daily', date: '2026-01-01' },
      { cadence: 'custom', date: '2026-01-05' }
    ]
  };

  assert.equal(nextReview(doc, 'daily'), null);
  assert.equal(nextReview(doc, 'unknown'), null);
  assert.equal(nextReview({ reviews: [] }, 'unknown'), null);
});
