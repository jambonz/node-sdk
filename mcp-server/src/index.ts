/**
 * jambonz MCP Schema Server
 *
 * Serves jambonz verb schemas and documentation as MCP resources.
 * Designed for AI agents that build jambonz voice applications.
 *
 * Usage:
 *   npx @jambonz/mcp-schema-server                    # stdio (Claude Desktop, etc)
 *   npx @jambonz/mcp-schema-server --http              # HTTP on port 3000
 *   npx @jambonz/mcp-schema-server --http --port 8080  # HTTP on custom port
 *   PORT=8080 npx @jambonz/mcp-schema-server --http    # port via env var
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { registerResources } from './resources.js';
import { registerTools } from './tools.js';

function createServer(): McpServer {
  const server = new McpServer({
    name: 'jambonz-schema-server',
    version: '0.1.0',
  });
  registerResources(server);
  registerTools(server);
  return server;
}

const args = process.argv.slice(2);
const httpMode = args.includes('--http');
const portArgIdx = args.indexOf('--port');
const port = portArgIdx !== -1 && args[portArgIdx + 1]
  ? parseInt(args[portArgIdx + 1], 10)
  : parseInt(process.env.PORT || '3000', 10);

if (httpMode) {
  const app = express();
  app.use(express.json());

  app.post('/mcp', async (req, res) => {
    const server = createServer();
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on('close', () => {
        transport.close();
        server.close();
      });
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  app.get('/mcp', (_req, res) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null,
    });
  });

  app.delete('/mcp', (_req, res) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null,
    });
  });

  app.listen(port, () => {
    console.log(`jambonz MCP schema server (HTTP) listening on port ${port}`);
  });
} else {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
