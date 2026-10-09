import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createClient } from './client.js';
import { toolDefinitions, executeTool } from './tools.js';

try {
  const server = new McpServer({ name: 'lifeos', version: '2.0.0' });
  for (const definition of toolDefinitions(createClient())) {
    // Advertise object properties; executeTool also checks cross-field refinements.
    const jsonSchema = z.object({ data: z.unknown() });
    const inputSchema = definition.schema instanceof z.ZodEffects ? definition.schema.innerType() : definition.schema;
    server.registerTool(definition.name, { description: definition.description, inputSchema, outputSchema: jsonSchema, annotations: definition.annotations }, args => executeTool(definition, args));
  }
  await server.connect(new StdioServerTransport());
} catch {
  // Stdout is reserved for MCP; configuration values must never enter logs.
  process.stderr.write('LifeOS MCP could not start. Check its environment and dependencies.\n');
  process.exitCode = 1;
}
