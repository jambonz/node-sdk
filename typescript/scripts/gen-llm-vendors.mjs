#!/usr/bin/env node
/**
 * Code generator: derive the LLM vendor union from the source of truth.
 *
 * The agent verb's `llm.vendor` is an enum defined once, in
 * `@jambonz/schema` (verbs/agent.schema.json). Hand-maintaining a matching
 * TypeScript union here drifts every time a vendor is added to the schema.
 * Instead we read the enum at build time and emit it as a TS literal union.
 *
 * Output: src/types/llm-vendors.generated.ts  (committed; regenerated on prebuild)
 * Run:    npm run gen:types
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve @jambonz/schema's location via its package.json (no `exports` field,
// so subpath file reads are permitted), then read the agent verb schema.
const schemaPkgJson = require.resolve('@jambonz/schema/package.json');
const schemaRoot = dirname(schemaPkgJson);
const agentSchemaPath = join(schemaRoot, 'verbs', 'agent.schema.json');

const agentSchema = JSON.parse(readFileSync(agentSchemaPath, 'utf8'));
const enumValues = agentSchema?.properties?.llm?.properties?.vendor?.enum;

if (!Array.isArray(enumValues) || enumValues.length === 0) {
  console.error(
    `[gen-llm-vendors] Could not find llm.vendor.enum in ${agentSchemaPath}`
  );
  process.exit(1);
}

const schemaVersion = JSON.parse(readFileSync(schemaPkgJson, 'utf8')).version;
const members = enumValues.map((v) => `  '${v}',`).join('\n');

const out = `// AUTO-GENERATED — DO NOT EDIT BY HAND.
// Source of truth: @jambonz/schema@${schemaVersion} verbs/agent.schema.json (llm.vendor.enum)
// Regenerate with: npm run gen:types
//
// This file derives the LLM vendor list from the JSON schema so the SDK's
// types never drift from the schema when a new vendor is added.

/** Supported LLM vendors for the agent verb, derived from the schema enum. */
export const LLM_VENDORS = [
${members}
] as const;

/** Union of LLM vendor ids accepted by the agent verb's \`llm.vendor\`. */
export type LlmVendor = (typeof LLM_VENDORS)[number];
`;

const outPath = resolve(__dirname, '..', 'src', 'types', 'llm-vendors.generated.ts');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, out);

console.log(
  `[gen-llm-vendors] Wrote ${enumValues.length} vendors from @jambonz/schema@${schemaVersion} -> src/types/llm-vendors.generated.ts`
);
