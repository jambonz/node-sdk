/**
 * jambonz MCP Schema Server
 *
 * Serves jambonz verb schemas and documentation as MCP resources.
 * Designed for AI agents that build jambonz voice applications.
 *
 * Usage:
 *   npx @jambonz/mcp-schema-server
 *
 * Or in Claude Desktop config:
 *   { "command": "npx", "args": ["@jambonz/mcp-schema-server"] }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerResources } from './resources.js';
import { registerTools } from './tools.js';

const server = new McpServer({
  name: 'jambonz-schema-server',
  version: '0.1.0',
});

registerResources(server);
registerTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
