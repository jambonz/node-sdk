/**
 * Registers MCP tools for jambonz schema and documentation access.
 *
 * Two tools:
 *  1. jambonz_developer_toolkit — returns the full guide (AGENTS.md) plus
 *     a verb/component/callback index.  ~15 KB, always safe under token limits.
 *  2. get_jambonz_schema — returns the full JSON Schema for a single verb,
 *     component, or callback on demand.  If a usage guide exists in docs/verbs/
 *     it is appended automatically.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/** Locate the schema directory. */
function findSchemaDir(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(__dirname, '../schema'),
    resolve(__dirname, '../../schema'),
    resolve(__dirname, '../../../schema'),
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

/** Locate AGENTS.md. */
function findAgentsMd(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(__dirname, '../AGENTS.md'),
    resolve(__dirname, '../../AGENTS.md'),
    resolve(__dirname, '../../../AGENTS.md'),
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

/** Locate the docs directory (optional — may not exist). */
function findDocsDir(): string | null {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(__dirname, '../docs'),
    resolve(__dirname, '../../docs'),
    resolve(__dirname, '../../../docs'),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return null;
}

/** List schema files in a directory, returning names without .schema.json suffix. */
function listSchemas(dir: string, exclude: string[] = []): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.schema.json'))
    .map((f) => basename(f, '.schema.json'))
    .filter((n) => !exclude.includes(n));
}

export function registerTools(server: McpServer): void {
  const schemaDir = findSchemaDir();
  const agentsMdPath = findAgentsMd();
  const docsDir = findDocsDir();

  const verbsDir = resolve(schemaDir, 'verbs');
  const componentsDir = resolve(schemaDir, 'components');
  const callbacksDir = resolve(schemaDir, 'callbacks');

  const verbNames = listSchemas(verbsDir);
  const componentNames = listSchemas(componentsDir);
  const callbackNames = listSchemas(callbacksDir, ['base']);

  // Build the index suffix (static — names don't change at runtime)
  const indexParts = [
    '\n---\n',
    '# Available JSON Schemas\n',
    'Use the get_jambonz_schema tool to fetch the full JSON Schema for any verb or component listed below.\n',
    `\n## Verbs\n${verbNames.join(', ')}\n`,
    `\n## Components\n${componentNames.join(', ')}\n`,
  ];
  if (callbackNames.length > 0) {
    indexParts.push(
      `\n## Callbacks (actionHook payloads)\n${callbackNames.join(', ')}\n`
    );
  }
  const indexSuffix = indexParts.join('\n');

  // Tool 1: Guide + index (reads AGENTS.md fresh each call for development)
  server.tool(
    'jambonz_developer_toolkit',
    'REQUIRED: You MUST call this tool before writing ANY jambonz code. Returns the complete jambonz developer guide covering: the @jambonz/sdk TypeScript SDK (WebhookResponse, WsSession, JambonzClient REST API, verb builder), verb model, webhook and WebSocket transports, actionHook payloads, mid-call control, recording, and working code examples. Also lists all available verb and component schemas.',
    {},
    async () => ({
      content: [{
        type: 'text' as const,
        text: readFileSync(agentsMdPath, 'utf-8') + indexSuffix,
      }],
    }),
  );

  // Tool 2: Individual schema lookup
  const allNames = [
    ...verbNames.map((n) => `verb:${n}`),
    ...componentNames.map((n) => `component:${n}`),
    ...callbackNames.map((n) => `callback:${n}`),
  ];
  server.tool(
    'get_jambonz_schema',
    `Get the full JSON Schema for a jambonz verb or component. Available: ${allNames.join(', ')}`,
    { name: z.string().describe('The verb or component name (e.g. "say", "gather", "dial", "recognizer", "synthesizer")') },
    async ({ name }) => {
      // Strip optional prefix (e.g. "verb:say" -> "say", "component:recognizer" -> "recognizer")
      const prefixMatch = name.match(/^(verb|component|callback):(.*)/);
      const bare = prefixMatch ? prefixMatch[2] : name;

      // All categories in search order
      const allCategories = [
        { prefix: 'verb', dir: verbsDir, names: verbNames, docsSubdir: 'verbs' },
        { prefix: 'component', dir: componentsDir, names: componentNames, docsSubdir: 'components' },
        { prefix: 'callback', dir: callbacksDir, names: callbackNames, docsSubdir: 'callbacks' },
      ] as const;

      // If prefix was explicit, only search that category; otherwise search all
      const categories = prefixMatch
        ? allCategories.filter((c) => c.prefix === prefixMatch[1])
        : allCategories;

      for (const { dir, names, docsSubdir } of categories) {
        if ((names as readonly string[]).includes(bare)) {
          let text = readFileSync(resolve(dir, `${bare}.schema.json`), 'utf-8');

          // Append usage docs if available (read fresh each call for easy editing)
          if (docsDir) {
            const docsPath = resolve(docsDir, docsSubdir, `${bare}.md`);
            if (existsSync(docsPath)) {
              const docs = readFileSync(docsPath, 'utf-8');
              text += `\n\n---\n# Usage Guide\n\n${docs}`;
            }
          }

          return { content: [{ type: 'text' as const, text }] };
        }
      }
      return {
        content: [{ type: 'text' as const, text: `Unknown schema "${name}". Available: ${allNames.join(', ')}` }],
        isError: true,
      };
    },
  );
}
