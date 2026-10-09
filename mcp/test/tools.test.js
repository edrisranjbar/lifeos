import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '../src/client.js';
import { toolDefinitions, executeTool } from '../src/tools.js';

const token = 'test-' + 'x'.repeat(64);
const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const client = fetchImpl => createClient({ baseUrl: 'http://localhost:8000', token, timeoutMs: 100, fetchImpl });
const query = c => toolDefinitions(c).find(t => t.name === 'lifeos_query');

test('all stable tools have schemas and destructive annotations', () => {
  const tools = toolDefinitions(client(async () => response({ data: {} })));
  assert.equal(tools.length, 15);
  assert.equal(new Set(tools.map(t => t.name)).size, 15);
  assert.deepEqual(tools.filter(t => t.annotations.readOnlyHint).map(t => t.name), ['lifeos_query']);
  for (const t of tools.filter(t => /delete_(goal|task|note)$/.test(t.name))) {
    assert.match(t.description, /Permanently delete/);
    assert.equal(t.annotations.destructiveHint, true);
  }
});
test('successful tool returns structured data and uses bearer HTTP only', async () => {
  const c = client(async (url, options) => {
    assert.equal(url.pathname, '/api/v1/dashboard');
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    assert.equal(options.redirect, 'error');
    return response({ data: { today: '2026-10-07' } });
  });
  assert.deepEqual((await executeTool(query(c), { type: 'dashboard' })).structuredContent, { data: { today: '2026-10-07' } });
});
for (const [status, code, message] of [[401, 'unauthorized', 'Invalid token'], [422, 'validation_error', 'amount must be positive']]) {
  test(`API ${status} surfaces a safe error`, async () => {
    const result = await executeTool(query(client(async () => response({ error: { code, message } }, status))), { type: 'dashboard' });
    assert.equal(result.isError, true);
    assert.equal(JSON.parse(result.content[0].text).error.code, code);
  });
}
test('malformed JSON is not echoed', async () => {
  const result = await executeTool(query(client(async () => new Response('Not found', { headers: { 'Content-Type': 'application/json' } }))), { type: 'dashboard' });
  assert.equal(JSON.parse(result.content[0].text).error.code, 'malformed_response');
});
test('non JSON and missing data are rejected', async () => {
  for (const result of [new Response('login page'), response({})]) {
    await assert.rejects(client(async () => result).request('GET', '/dashboard'), e => e.code === 'malformed_response');
  }
});
test('timeout is bounded even when mock fetch ignores abort', async () => {
  await assert.rejects(client(() => new Promise(() => {})).request('GET', '/dashboard'), e => e.code === 'timeout');
});
test('token is redacted from malicious upstream error and content', async () => {
  const result = await executeTool(query(client(async () => response({ error: { code: 'bad', message: token } }, 500))), { type: 'dashboard' });
  assert.ok(!JSON.stringify(result).includes(token));
  assert.ok(!JSON.stringify(await client(async () => response({ data: { text: token } })).request('GET', '/dashboard')).includes(token));
});
test('invalid arguments are rejected before HTTP', async () => {
  let called = false;
  const c = client(async () => { called = true; return response({ data: {} }); });
  const expense = toolDefinitions(c).find(t => t.name === 'lifeos_log_expense');
  const result = await executeTool(expense, { amount: -1, category_id: 'food', date: '2026-02-30' });
  assert.equal(result.isError, true);
  assert.equal(called, false);
  const task = toolDefinitions(c).find(t => t.name === 'lifeos_create_task');
  assert.equal((await executeTool(task, { source: 'kanban', title: 'Missing board' })).isError, true);
});
test('secret opt-in, scope filters and expense arguments are forwarded', async () => {
  const calls = [];
  const tools = toolDefinitions({ request: async (...args) => { calls.push(args); return {}; } });
  await executeTool(tools.find(t => t.name === 'lifeos_query'), { type: 'note', id: 'abc', include_secret: true });
  assert.equal(calls[0][2].query.include_secret, '1');
  await executeTool(tools.find(t => t.name === 'lifeos_complete_task'), { id: 'abc', source: 'goal', goal_id: 'goal' });
  assert.equal(calls[1][2].query.goal_id, 'goal');
});
test('configuration rejects plaintext remote origins and URL credentials', () => {
  for (const baseUrl of ['http://example.com', 'https://user:pass@example.com', 'https://example.com/path', 'https://example.com/?x=1']) assert.throws(() => createClient({ baseUrl, token }));
  assert.throws(() => createClient({ baseUrl: 'https://example.com', token: 'short' }));
});
test('lifeos_query routes every type to the same API calls as the old read tools', async () => {
  const calls = [];
  const q = query({ request: async (method, path, options) => { calls.push([method, path, options?.query]); return {}; } });
  const cases = [
    [{ type: 'dashboard' }, '/dashboard'], [{ type: 'goals' }, '/goals'], [{ type: 'goal', id: 'g/1' }, '/goals/g%2F1'],
    [{ type: 'tasks', source: 'kanban', board_id: 'b', column_id: 'c' }, '/tasks', { source: 'kanban', board_id: 'b', column_id: 'c' }],
    [{ type: 'task', id: 't', source: 'goal', goal_id: 'g' }, '/tasks/t', { source: 'goal', goal_id: 'g', board_id: undefined }],
    [{ type: 'habits' }, '/habits'], [{ type: 'today_habits' }, '/habits/today'],
    [{ type: 'finance_summary', period: 'Mehr' }, '/finance', { period: 'Mehr' }], [{ type: 'expenses' }, '/finance/expenses', { period: undefined }],
    [{ type: 'incomes', period: 'Mehr' }, '/finance/incomes', { period: 'Mehr' }],
    [{ type: 'notes' }, '/notes', { include_secret: undefined }], [{ type: 'note', id: 'n', include_secret: true }, '/notes/n', { include_secret: '1' }]
  ];
  for (const [args, path, expected] of cases) {
    const result = await executeTool(q, args);
    assert.equal(result.isError, undefined, args.type);
    const [method, calledPath, sent] = calls.at(-1);
    assert.equal(method, 'GET');
    assert.equal(calledPath, path, args.type);
    if (expected) assert.deepEqual(sent, expected, args.type);
  }
  assert.equal(calls.length, 12);
});
test('lifeos_query rejects parameters that do not apply to the type', async () => {
  let called = false;
  const q = query({ request: async () => { called = true; return {}; } });
  for (const [args, pattern] of [
    [{ type: 'goal' }, /requires id/], [{ type: 'goals', id: 'x' }, /"goals" does not accept id/],
    [{ type: 'dashboard', include_secret: true }, /does not accept include_secret/], [{ type: 'notes', period: 'Mehr' }, /does not accept period/],
    [{ type: 'task', id: 't', column_id: 'c' }, /does not accept column_id/], [{ type: 'unknown' }, /type/], [{ type: 'goals', extra: 1 }, /extra/]
  ]) {
    const result = await executeTool(q, args);
    assert.equal(result.isError, true, JSON.stringify(args));
    assert.match(JSON.parse(result.content[0].text).error.message, pattern);
  }
  assert.equal(called, false);
});
