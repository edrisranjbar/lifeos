import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

const base = process.env.LIFEOS_TEST_BASE_URL;
test('disposable MySQL app: API CRUD, browser persistence and real MCP', { skip: !base }, async () => {
  const origin = new URL(base);
  assert.ok(['localhost', '127.0.0.1'].includes(origin.hostname), 'Integration test must use localhost');
  const context = JSON.parse(await readFile(new URL('../../.secrets/api-test-context.json', import.meta.url), 'utf8'));
  assert.match(context.database, /^lifeos_api_test_[a-f0-9]{12}$/);
  const request = async (method, path, body, expected = 200) => {
    const res = await fetch(base + '/api/v1/' + path, { method, headers: { Authorization: `Bearer ${context.token}`, 'Content-Type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    assert.equal(res.status, expected, `${method} ${path}`);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    return (await res.json()).data;
  };
  const missing = await fetch(base + '/api/v1/health');
  assert.equal(missing.status, 401);
  assert.equal((await missing.json()).error.code, 'unauthorized');
  const wrong = await fetch(base + '/api/v1/health', { headers: { Authorization: 'Bearer wrong' } });
  assert.equal(wrong.status, 401);
  assert.equal((await request('GET', 'health')).ok, true);
  assert.equal((await request('GET', 'dashboard')).timezone, 'Asia/Tehran');
  const beforeFinance = await request('GET', 'finance');
  const oldIncome = (await request('GET', 'finance/incomes')).find(income => income.id === 'airshoes')?.amount || 0;
  const expectedBalance = beforeFinance.income_total - oldIncome + 50000000 - beforeFinance.expense_total - 450000;
  const goal = await request('POST', 'goals', { title: 'Build studio', tasks: [{ title: 'Repair walls' }], measures: [{ metric: 'Readiness', target: 8 }] }, 201);
  await request('PATCH', `goals/${goal.id}`, { title: 'Dream home studio' });
  assert.equal((await request('GET', `goals/${goal.id}`)).title, 'Dream home studio');
  const task = await request('POST', 'tasks', { source: 'goal', goal_id: goal.id, title: 'Buy panels' }, 201);
  assert.equal((await request('POST', `tasks/${task.id}/complete`, {})).done, true);
  const card = await request('POST', 'tasks', { source: 'kanban', board_id: 'fixture-board', column_id: 'todo', title: 'Deploy' }, 201);
  assert.equal((await request('POST', `tasks/${card.id}/complete`, {})).column_id, 'done');
  const expense = await request('POST', 'finance/expenses', { category_id: 'food', amount: 450000, date: '2026-10-07' }, 201);
  await request('POST', 'finance/incomes', { name: 'Airshoes', amount: 50000000 }, 201);
  assert.equal((await request('GET', 'finance')).balance, expectedBalance);
  await request('POST', 'habits/1/complete', {}); await request('POST', 'habits/1/complete', {});
  assert.equal((await request('GET', 'habits/today')).habits[0].done, true);
  await request('DELETE', 'habits/1/complete', {});
  const notes = await request('GET', 'notes');
  assert.ok(!JSON.stringify(notes).includes('NEVER_EXPOSE_SENTINEL'));
  await request('GET', 'notes/secret-sentinel', undefined, 404);
  const note = await request('POST', 'notes', { title: 'Studio Ideas', body: 'Panels' }, 201);

  // Existing browser login and state endpoints read the same MySQL documents.
  const login = await fetch(base + '/login.php', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ username: 'api-fixture', password: 'fixture-only-password' }) });
  assert.equal(login.status, 302);
  const cookie = login.headers.getSetCookie().find(c => c.startsWith('edi_life_os=')).split(';')[0];
  const session = await fetch(base + '/state.php', { headers: { Cookie: cookie } });
  const saved = await session.json();
  assert.ok(JSON.parse(saved.data.edi_goals_v1).goals.some(g => g.id === goal.id));
  assert.ok(JSON.parse(saved.data.daramd_v1).expenses.some(e => e.id === expense.id));
  assert.ok(JSON.parse(saved.data.edi_notes_v1).notes.some(n => n.id === note.id));
  await request('PATCH', `goals/${goal.id}`, { notes: 'External update' });
  const stale = await fetch(base + '/state.php', { method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': saved.csrf }, body: JSON.stringify({ key: 'edi_goals_v1', value: saved.data.edi_goals_v1, revision: saved.revisions.edi_goals_v1 }) });
  assert.equal(stale.status, 409);

  const mcp = new Client({ name: 'local-api-test', version: '1.0' });
  try {
    await mcp.connect(new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../src/index.js', import.meta.url))], env: { ...process.env, LIFEOS_BASE_URL: base, LIFEOS_API_TOKEN: context.token }, stderr: 'pipe' }));
    assert.equal((await mcp.listTools()).tools.length, 15);
    const dashboard = await mcp.callTool({ name: 'lifeos_query', arguments: { type: 'dashboard' } });
    assert.equal(dashboard.structuredContent.data.finance.balance, expectedBalance);
    const created = await mcp.callTool({ name: 'lifeos_create_goal', arguments: { title: 'MCP Studio', deadline: '2027-01-07' } });
    assert.equal(created.isError, undefined);
    await request('DELETE', `goals/${created.structuredContent.data.id}`);
  } finally { await mcp.close(); }
  await request('DELETE', `notes/${note.id}`);
  await request('DELETE', `tasks/${card.id}`);
  await request('DELETE', `goals/${goal.id}`);
});
