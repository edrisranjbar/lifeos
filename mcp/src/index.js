#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createClient } from './client.js';
import { toolDefinitions, executeTool } from './tools.js';

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
);
const version = packageJson.version || '0.0.0';

const args = process.argv.slice(2);
if (args.includes('--version') || args.includes('-v')) {
  process.stdout.write(`${version}\n`);
  process.exit(0);
}

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(`LifeOS MCP Server (v${version})

Usage:
  lifeos-mcp [options]
  node src/index.js [options]

Options:
  -v, --version  Show version number and exit
  -h, --help     Show this help message and exit

Environment Variables:
  LIFEOS_BASE_URL        Base URL of the LifeOS web app (e.g. https://lifeos.example.com or http://localhost:8080)
  LIFEOS_API_TOKEN       API authentication token (minimum 32 characters)
  LIFEOS_MCP_TIMEOUT_MS  Request timeout in milliseconds (optional, 100-120000, default: 10000)
`);
  process.exit(0);
}

try {
  const server = new McpServer({ name: 'lifeos', version });
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
