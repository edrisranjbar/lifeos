import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

test('real SDK stdio initialization, tool schemas, invocation and errors', async () => {
  const http = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/v1/dashboard') res.end(JSON.stringify({ data: { today: '2026-10-07' } }));
    else { res.statusCode = 422; res.end(JSON.stringify({ error: { code: 'validation_error', message: 'Test validation error' } })); }
  });
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  const client = new Client({ name: 'lifeos-test', version: '1.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../src/index.js', import.meta.url))], env: { ...process.env, LIFEOS_BASE_URL: `http://127.0.0.1:${http.address().port}`, LIFEOS_API_TOKEN: 'fixture-' + 'x'.repeat(64) }, stderr: 'pipe' });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.equal(tools.length, 15);
    for (const tool of tools) assert.equal(tool.inputSchema.type, 'object', tool.name);
    assert.ok(tools.find(t => t.name === 'lifeos_create_task').inputSchema.properties.source);
    const query = tools.find(t => t.name === 'lifeos_query');
    assert.equal(query.annotations.readOnlyHint, true);
    assert.ok(query.inputSchema.properties.type.enum.includes('today_habits'));
    const result = await client.callTool({ name: 'lifeos_query', arguments: { type: 'dashboard' } });
    assert.deepEqual(result.structuredContent, { data: { today: '2026-10-07' } });
    const error = await client.callTool({ name: 'lifeos_create_note', arguments: { title: 'Test' } });
    assert.equal(error.isError, true);
    assert.match(error.content[0].text, /validation_error/);
  } finally { await client.close(); await new Promise(resolve => http.close(resolve)); }
});
