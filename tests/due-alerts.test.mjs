import test from 'node:test';
import assert from 'node:assert/strict';
import { collectDueItems, classify, pendingNotifications, NOTIFY_WINDOW, addDays } from '../public_html/assets/due-alerts.js';

// Midday local time keeps the Tehran calendar day stable in any runner time zone.
const NOW = new Date('2026-10-20T12:00:00').getTime();
const at = (date, time = '09:00') => new Date(`${date}T${time}`).getTime();
const board = (cards, columnName = 'To Do') => ({ id: 'b1', name: 'Work', columns: [{ id: 'c1', name: columnName, cards }] });

test('collects open dated cards, goals and payments only', () => {
  const items = collectDueItems({
    boards: [
      board([
        { id: 'k1', title: 'Ship it', dueDate: '2026-10-20', dueTime: '15:00', reminder: '60' },
        { id: 'k2', title: 'Done already', dueDate: '2026-10-20', completed: true },
        { id: 'k3', title: 'No date' },
      ]),
      { id: 'b2', name: 'Home', columns: [{ id: 'd', name: 'Done', cards: [{ id: 'k4', title: 'In done column', dueDate: '2026-10-19' }] }] },
    ],
    goals: [
      { id: 'g1', title: 'Run 10k', deadline: '2026-10-22' },
      { id: 'g2', title: 'Archived', deadline: '2026-10-21', status: 'archived' },
      { id: 'g3', title: 'Finished', deadline: '2026-10-21' },
    ],
    payments: [
      { id: 'p1', title: 'Rent', date: '2026-10-20', direction: 'debit', status: 'pending', amount: 1500000 },
      { id: 'p2', title: 'Paid', date: '2026-10-20', status: 'paid', amount: 1 },
      { id: 'p3', title: 'Skipped', date: '2026-10-20', skipped: true, amount: 1 },
      { id: 'p4', title: 'Loan back', date: '2026-10-23', direction: 'credit', status: 'pending', amount: 200 },
    ],
    goalDone: goal => goal.id === 'g3',
    currency: 'Toman',
  });
  assert.deepEqual(items.map(item => item.key), ['card:b1:k1', 'goal:g1', 'payment:p1', 'payment:p4']);
  const card = items[0];
  assert.equal(card.reminderMinutes, 60);
  assert.equal(card.dueAt, at('2026-10-20', '15:00'));
  assert.deepEqual(card.open, { page: 'kanban', boardId: 'b1', cardId: 'k1' });
  assert.equal(items[2].title, 'Pay · Rent');
  assert.equal(items[2].context, '1,500,000 Toman');
  assert.equal(items[3].title, 'Receive · Loan back');
});

test('cards without a time are due at 09:00, like Kanban reminders', () => {
  const [card] = collectDueItems({ boards: [board([{ id: 'k', title: 'T', dueDate: '2026-10-21', dueTime: '' }])] });
  assert.equal(card.dueAt, at('2026-10-21', '09:00'));
  assert.equal(card.time, '');
});

test('groups items into overdue, today and coming up', () => {
  const items = collectDueItems({
    boards: [board([
      { id: 'late', title: 'Late', dueDate: '2026-10-20', dueTime: '08:00' },
      { id: 'later', title: 'Later today', dueDate: '2026-10-20', dueTime: '18:00' },
      { id: 'tomorrow', title: 'Tomorrow morning', dueDate: '2026-10-21', dueTime: '09:00' },
      { id: 'far', title: 'Next week', dueDate: '2026-10-27', dueTime: '09:00' },
    ])],
    goals: [{ id: 'old', title: 'Old goal', deadline: '2026-10-18' }, { id: 'soon', title: 'Soon goal', deadline: '2026-10-23' }],
  });
  const groups = classify(items, NOW);
  assert.deepEqual(groups.overdue.map(item => item.title), ['Old goal', 'Late']);
  assert.deepEqual(groups.today.map(item => item.title), ['Later today']);
  assert.deepEqual(groups.soon.map(item => item.title), ['Tomorrow morning', 'Soon goal']);
});

test('a date-only item due today is not overdue before the day ends', () => {
  const items = collectDueItems({ goals: [{ id: 'g', title: 'Deadline today', deadline: '2026-10-20' }] });
  const groups = classify(items, NOW);
  assert.equal(groups.overdue.length, 0);
  assert.equal(groups.today.length, 1);
});

test('notifications fire once, at the reminder and the due time', () => {
  const items = collectDueItems({ boards: [board([{ id: 'k', title: 'T', dueDate: '2026-10-20', dueTime: '12:30', reminder: '60' }])] });
  const reminder = pendingNotifications(items, at('2026-10-20', '11:45'), {});
  assert.deepEqual(reminder.map(entry => entry.stage), ['before-60']);
  const shown = { [reminder[0].key]: at('2026-10-20', '11:45') };
  assert.equal(pendingNotifications(items, at('2026-10-20', '12:00'), shown).length, 0);
  const due = pendingNotifications(items, at('2026-10-20', '12:31'), shown);
  assert.deepEqual(due.map(entry => entry.stage), ['due']);
});

test('old overdue items never pop up as notifications', () => {
  const items = collectDueItems({ goals: [{ id: 'g', title: 'Long overdue', deadline: '2026-10-10' }] });
  assert.equal(pendingNotifications(items, NOW, {}).length, 0);
  const late = collectDueItems({ boards: [board([{ id: 'k', title: 'Timed', dueDate: '2026-10-20', dueTime: '09:00' }])] });
  assert.equal(pendingNotifications(late, at('2026-10-20', '09:00') + NOTIFY_WINDOW - 1000, {}).length, 1);
  assert.equal(pendingNotifications(late, at('2026-10-20', '09:00') + NOTIFY_WINDOW + 1000, {}).length, 0);
});

test('a date-only item notifies any time on its due day, but not after', () => {
  const items = collectDueItems({ payments: [{ id: 'p', title: 'Rent', date: '2026-10-20', status: 'pending', amount: 1 }] });
  assert.equal(pendingNotifications(items, at('2026-10-20', '08:59'), {}).length, 0);
  assert.equal(pendingNotifications(items, at('2026-10-20', '13:00'), {}).length, 1);
  assert.equal(pendingNotifications(items, at('2026-10-21', '12:00'), {}).length, 0);
});

test('a rescheduled item alerts again for its new date', () => {
  const first = collectDueItems({ boards: [board([{ id: 'k', title: 'T', dueDate: '2026-10-20', dueTime: '10:00' }])] });
  const [entry] = pendingNotifications(first, at('2026-10-20', '10:05'), {});
  const shown = { [entry.key]: at('2026-10-20', '10:05') };
  const moved = collectDueItems({ boards: [board([{ id: 'k', title: 'T', dueDate: '2026-10-21', dueTime: '10:00' }])] });
  assert.equal(pendingNotifications(moved, at('2026-10-21', '10:05'), shown).length, 1);
});

test('addDays crosses month boundaries', () => {
  assert.equal(addDays('2026-10-30', 3), '2026-11-02');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});
