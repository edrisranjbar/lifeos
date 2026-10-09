import { z } from 'zod';
import { LifeOsError } from './client.js';

const id = z.string().min(1).max(128).describe('Existing LifeOS resource ID.');
const title = z.string().trim().min(1).max(200);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Use a real ISO date (YYYY-MM-DD).');
const priority = z.enum(['low', 'medium', 'high']);
const money = z.number().finite().positive().max(1e15).describe('Amount in Toman, matching the finance UI.');
const measure = z.object({ id: id.optional(), metric: z.string().trim().min(1).max(120), target: z.number().min(0).max(1e15).nullable().optional(), current: z.number().min(0).max(1e15).nullable().optional(), unit: z.string().max(20).optional() }).strict();
const goalTask = z.object({ id: id.optional(), title: z.string().trim().min(1).max(500), done: z.boolean().optional(), due_date: date.nullable().optional(), priority: priority.optional() }).strict();
const goalFields = { progressSource: z.enum(["checklist", "measure", "habit"]).optional(), habitProgress: z.object({habitId: id, habitName: z.string().max(200).optional(), targetDays: z.number().int().positive()}).strict().nullable().optional(), title, specific: z.string().max(20000).optional(), category: z.string().max(200).optional(), relevant: z.string().max(20000).optional(), priority: priority.optional(), deadline: date.nullable().optional(), startDate: date.nullable().optional(), notes: z.string().max(20000).optional(), status: z.enum(['active', 'archived']).optional(), measures: z.array(measure).max(100).optional(), tasks: z.array(goalTask).max(500).optional() };
const taskScope = { source: z.enum(['goal', 'kanban']).optional(), goal_id: id.optional(), board_id: id.optional() };
const taskFields = { title: z.string().trim().min(1).max(500).optional(), description: z.string().max(20000).optional(), priority: priority.optional(), due_date: date.nullable().optional(), done: z.boolean().optional(), column_id: id.optional() };
const noteFields = { title: z.string().max(500).optional(), body: z.string().max(100000).optional(), color: z.enum(['yellow', 'pink', 'blue', 'green', 'lavender', 'peach']).optional(), fontFace: z.enum(['sans', 'serif', 'mono']).optional(), fontSize: z.number().int().min(11).max(28).optional(), secret: z.boolean().optional() };
const includeSecret = z.boolean().optional().describe('Request secret notes only when server config explicitly permits it. Default false.');
const period = z.string().trim().min(1).max(120).optional().describe('Existing period name; omit for active period.');
const object = shape => z.object(shape).strict();
const encode = value => encodeURIComponent(value);
const secretQuery = args => ({ include_secret: args.include_secret ? '1' : undefined });
const splitTask = ({ id: taskId, source, goal_id, board_id, ...body }) => ({ taskId, body, query: { source, goal_id, board_id } });
const splitNote = ({ id: noteId, include_secret, ...body }) => ({ noteId, body, query: secretQuery({ include_secret }) });

export function toolDefinitions(client) {
  const call = (method, path, options) => client.request(method, path, options);
  const definitions = [];
  const add = (name, description, schema, execute, readOnly = false, destructive = false, idempotent = readOnly) => definitions.push({ name, description, schema, execute, annotations: { readOnlyHint: readOnly, destructiveHint: destructive, idempotentHint: idempotent, openWorldHint: false } });
  // One read tool instead of a list/get pair per domain, so models pick between fewer near-duplicate tools.
  const queries = {
    dashboard: { run: () => call('GET', '/dashboard') },
    goals: { run: () => call('GET', '/goals') },
    goal: { id: true, run: a => call('GET', `/goals/${encode(a.id)}`) },
    tasks: { params: ['source', 'goal_id', 'board_id', 'column_id'], run: ({ type, ...query }) => call('GET', '/tasks', { query }) },
    task: { id: true, params: ['source', 'goal_id', 'board_id'], run: ({ type, ...a }) => { const s = splitTask(a); return call('GET', `/tasks/${encode(s.taskId)}`, { query: s.query }); } },
    habits: { run: () => call('GET', '/habits') },
    today_habits: { run: () => call('GET', '/habits/today') },
    finance_summary: { params: ['period'], run: a => call('GET', '/finance', { query: { period: a.period } }) },
    expenses: { params: ['period'], run: a => call('GET', '/finance/expenses', { query: { period: a.period } }) },
    incomes: { params: ['period'], run: a => call('GET', '/finance/incomes', { query: { period: a.period } }) },
    notes: { params: ['include_secret'], run: a => call('GET', '/notes', { query: secretQuery(a) }) },
    note: { id: true, params: ['include_secret'], run: a => call('GET', `/notes/${encode(a.id)}`, { query: secretQuery(a) }) }
  };
  const querySchema = object({ type: z.enum(Object.keys(queries)).describe('What to read. finance_summary, expenses and incomes take an optional period name (omit for the active period).'), id: id.optional().describe('Required for goal, task and note.'), ...taskScope, column_id: id.optional(), period, include_secret: includeSecret }).superRefine((a, ctx) => {
    const { id: needsId, params = [] } = queries[a.type];
    if (needsId && a.id === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['id'], message: `type "${a.type}" requires id.` });
    const extra = Object.keys(a).filter(key => key !== 'type' && a[key] !== undefined && !(key === 'id' && needsId) && !params.includes(key));
    if (extra.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `type "${a.type}" does not accept ${extra.join(', ')}. It accepts ${[needsId && 'id', ...params].filter(Boolean).join(', ') || 'no other parameters'}.` });
  });
  add('lifeos_query', 'Read LifeOS data. type picks what to read: dashboard (compact context: goals, due tasks, habits, finance, recent non-secret notes; dates in Asia/Tehran), goals (SMART goals with measures and checklist tasks), goal (one goal by id), tasks (goal checklist tasks and Kanban cards; optional source/goal_id/board_id/column_id filters), task (one task by id; optional source and container IDs resolve ambiguous IDs), habits (active habits), today_habits (today’s habits and completion status), finance_summary (income, expenses, balance and budget totals in Toman), expenses (expenses in a period; dates keep the UI month/day format), incomes (income streams in a period), notes (secret notes hidden unless include_secret and enabled on the server), note (one visible note by id; hidden secret IDs return not found).', querySchema, a => queries[a.type].run(a), true);
  add('lifeos_create_goal', 'Create a SMART goal. IDs are generated; supply ISO deadline and optional measures/tasks.', object(goalFields), a => call('POST', '/goals', { body: a }));
  add('lifeos_update_goal', 'Update supported goal fields. Supplied measures or tasks replace their lists; omitted fields are preserved.', object({ id, patch: object(Object.fromEntries(Object.entries(goalFields).map(([k, v]) => [k, v.optional()]))) }), a => call('PATCH', `/goals/${encode(a.id)}`, { body: a.patch }), false, false, true);
  add('lifeos_delete_goal', 'Permanently delete a SMART goal and all of its checklist tasks.', object({ id }), a => call('DELETE', `/goals/${encode(a.id)}`), false, true);
  const createTask = object({ ...taskFields, title: z.string().trim().min(1).max(500), source: z.enum(['goal', 'kanban']), goal_id: id.optional(), board_id: id.optional() }).superRefine((a, ctx) => {
    if (a.source === 'goal' && (!a.goal_id || a.board_id || a.column_id || a.description !== undefined)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Goal tasks require goal_id and cannot include board_id, column_id or description.' });
    if (a.source === 'kanban' && (!a.board_id || !a.column_id || a.goal_id)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Kanban tasks require board_id and column_id and cannot include goal_id.' });
  });
  add('lifeos_create_task', 'Create a goal task (goal_id) or Kanban card (board_id and column_id).', createTask, a => call('POST', '/tasks', { body: a }));
  add('lifeos_update_task', 'Update task fields. To reopen a Kanban card, set done=false and provide a non-Done column_id. Goal tasks do not support description.', object({ id, ...taskScope, patch: object(taskFields) }), a => { const s = splitTask(a); return call('PATCH', `/tasks/${encode(s.taskId)}`, { body: a.patch, query: s.query }); }, false, false, true);
  add('lifeos_complete_task', 'Complete a goal task or move a Kanban card to an existing Done/Completed/Complete column. Returns conflict if none exists.', object({ id, ...taskScope }), a => { const s = splitTask(a); return call('POST', `/tasks/${encode(s.taskId)}/complete`, { body: {}, query: s.query }); }, false, false, true);
  add('lifeos_delete_task', 'Permanently delete a goal checklist task or Kanban card. Use source and container IDs for ambiguous IDs.', object({ id, ...taskScope }), a => { const s = splitTask(a); return call('DELETE', `/tasks/${encode(s.taskId)}`, { query: s.query }); }, false, true);
  const habitArgs = object({ id: z.number().int().positive(), date: date.optional().describe('Omit for today in Asia/Tehran.') });
  add('lifeos_complete_habit', 'Mark a habit completed for a date. Idempotent; repeated calls keep it completed.', habitArgs, a => call('POST', `/habits/${a.id}/complete`, { body: { date: a.date } }), false, false, true);
  add('lifeos_uncomplete_habit', 'Remove a habit completion for a date. Idempotent.', habitArgs, a => call('DELETE', `/habits/${a.id}/complete`, { body: { date: a.date } }), false, false, true);
  add('lifeos_log_expense', 'Record an expense in Toman in an existing category/period. Use finance summary to find category IDs.', object({ period, category_id: id, description: z.string().max(2000).optional(), amount: money, date: date.optional() }), a => call('POST', '/finance/expenses', { body: a }));
  add('lifeos_set_income', 'Set an income stream amount in Toman. A matching lowercased name ID updates its amount, matching the UI.', object({ period, name: title, amount: money }), a => call('POST', '/finance/incomes', { body: a }), false, false, true);
  add('lifeos_create_note', 'Create a sticky note with frontend-compatible appearance and position defaults.', object(noteFields), a => call('POST', '/notes', { body: a }));
  add('lifeos_update_note', 'Update supported note fields. Making a note secret hides its content from the response unless access is enabled and requested.', object({ id, include_secret: includeSecret, patch: object(noteFields) }), a => { const s = splitNote(a); return call('PATCH', `/notes/${encode(s.noteId)}`, { body: a.patch, query: s.query }); }, false, false, true);
  add('lifeos_delete_note', 'Permanently delete a visible note and its related connections.', object({ id, include_secret: includeSecret }), a => { const s = splitNote(a); return call('DELETE', `/notes/${encode(s.noteId)}`, { query: s.query }); }, false, true);
  return definitions;
}

export async function executeTool(definition, args) {
  const parsed = definition.schema.safeParse(args);
  if (!parsed.success) return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: { code: 'validation_error', message: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') } }) }] };
  try {
    const data = await definition.execute(parsed.data);
    return { content: [{ type: 'text', text: JSON.stringify({ data }) }], structuredContent: { data } };
  } catch (error) {
    const safe = error instanceof LifeOsError ? { code: error.code, message: error.message, status: error.status } : { code: 'internal_error', message: 'Unable to execute LifeOS tool.' };
    return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: safe }) }] };
  }
}
