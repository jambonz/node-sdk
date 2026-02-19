/**
 * Registers jambonz schema files and documentation as MCP resources.
 */

import { readFileSync, readdirSync } from 'fs';
import { resolve, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/** Locate the schema directory. Checks:
 *  1. Bundled in npm package: mcp-server/schema/ (copied by prepack)
 *  2. Development: sibling to mcp-server/ at agent-toolkit/schema/
 */
function findSchemaDir(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(__dirname, '../schema'),          // npm: mcp-server/schema/
    resolve(__dirname, '../../schema'),       // dev: from dist/ or src/
    resolve(__dirname, '../../../schema'),     // dev: nested
  ];
  for (const dir of candidates) {
    try {
      readdirSync(dir);
      return dir;
    } catch {
      // continue
    }
  }
  throw new Error('Could not locate schema directory');
}

/** Locate AGENTS.md. Checks:
 *  1. Bundled in npm package: mcp-server/AGENTS.md (copied by prepack)
 *  2. Development: sibling to mcp-server/ at agent-toolkit/AGENTS.md
 */
function findAgentsMd(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(__dirname, '../AGENTS.md'),       // npm: mcp-server/AGENTS.md
    resolve(__dirname, '../../AGENTS.md'),    // dev: from dist/ or src/
    resolve(__dirname, '../../../AGENTS.md'), // dev: nested
  ];
  for (const path of candidates) {
    try {
      readFileSync(path, 'utf-8');
      return path;
    } catch {
      // continue
    }
  }
  throw new Error('Could not locate AGENTS.md');
}

export function registerResources(server: McpServer): void {
  const schemaDir = findSchemaDir();
  const agentsMdPath = findAgentsMd();

  // 1. AGENTS.md — the main documentation resource
  server.resource(
    'agents-guide',
    'jambonz://docs/agents-guide',
    {
      description: 'jambonz Agent Toolkit guide — explains the verb model, transport modes, core verbs, and common patterns',
      mimeType: 'text/markdown',
    },
    async (uri) => ({
      contents: [{
        uri: uri.href,
        text: readFileSync(agentsMdPath, 'utf-8'),
        mimeType: 'text/markdown',
      }],
    }),
  );

  // 2. Root application schema
  const appSchemaPath = resolve(schemaDir, 'jambonz-app.schema.json');
  server.resource(
    'app-schema',
    'jambonz://schema/jambonz-app',
    {
      description: 'Root JSON Schema for a jambonz application — an array of verbs',
      mimeType: 'application/schema+json',
    },
    async (uri) => ({
      contents: [{
        uri: uri.href,
        text: readFileSync(appSchemaPath, 'utf-8'),
        mimeType: 'application/schema+json',
      }],
    }),
  );

  // 3. Verb schemas
  const verbsDir = resolve(schemaDir, 'verbs');
  const verbFiles = readdirSync(verbsDir).filter((f) => f.endsWith('.schema.json'));

  for (const file of verbFiles) {
    const verbName = basename(file, '.schema.json');
    const filePath = resolve(verbsDir, file);

    server.resource(
      `verb-${verbName}`,
      `jambonz://schema/verbs/${verbName}`,
      {
        description: `JSON Schema for the "${verbName}" verb`,
        mimeType: 'application/schema+json',
      },
      async (uri) => ({
        contents: [{
          uri: uri.href,
          text: readFileSync(filePath, 'utf-8'),
          mimeType: 'application/schema+json',
        }],
      }),
    );
  }

  // 4. Component schemas
  const componentsDir = resolve(schemaDir, 'components');
  const componentFiles = readdirSync(componentsDir).filter((f) => f.endsWith('.schema.json'));

  for (const file of componentFiles) {
    const componentName = basename(file, '.schema.json');
    const filePath = resolve(componentsDir, file);

    server.resource(
      `component-${componentName}`,
      `jambonz://schema/components/${componentName}`,
      {
        description: `JSON Schema for the "${componentName}" component`,
        mimeType: 'application/schema+json',
      },
      async (uri) => ({
        contents: [{
          uri: uri.href,
          text: readFileSync(filePath, 'utf-8'),
          mimeType: 'application/schema+json',
        }],
      }),
    );
  }
}
