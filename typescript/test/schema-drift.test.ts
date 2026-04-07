/**
 * Schema drift test — ensures TypeScript verb interfaces stay in sync
 * with the JSON Schema files. Compares property names to catch drift.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const schemaDir = resolve(require.resolve('@jambonz/schema'), '..');
const __dirname_test = dirname(fileURLToPath(import.meta.url));
const verbsDir = resolve(schemaDir, 'verbs');
const componentsDir = resolve(schemaDir, 'components');
const typesDir = resolve(__dirname_test, '../src/types');

/** Parse top-level interface property names from a TypeScript source string.
 *  Also follows `extends BaseInterface` to collect inherited properties. */
function parseInterfaceProps(source: string, interfaceName: string): string[] {
  // Match interface with optional extends clause
  const regex = new RegExp(`export interface ${interfaceName}\\s+(?:extends\\s+(\\w+)\\s*)?\\{`);
  const match = regex.exec(source);
  if (!match) return [];

  const parentName = match[1]; // e.g. 'LlmBaseOptions' or undefined
  const start = match.index + match[0].length;
  const props: string[] = [];
  let depth = 0; // 0 = inside the top-level interface body

  for (const line of source.slice(start).split('\n')) {
    // Check for a property declaration BEFORE updating depth
    // A top-level property is at depth 0 before processing this line
    if (depth === 0) {
      const propMatch = line.match(/^\s+(\w+)\??:/);
      if (propMatch) {
        props.push(propMatch[1]);
      }
    }

    // Update depth based on braces in this line
    for (const ch of line) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }

    // If depth goes negative, we've closed the interface
    if (depth < 0) break;
  }

  // Recurse into parent interface if present
  if (parentName) {
    props.push(...parseInterfaceProps(source, parentName));
  }

  return props;
}

/** Map schema file base name to TypeScript interface name. */
function schemaNameToInterface(schemaBaseName: string, isVerb: boolean): string {
  if (!isVerb) {
    // Component: capitalize first letter
    return schemaBaseName.charAt(0).toUpperCase() + schemaBaseName.slice(1);
  }

  // Verb: handle special cases
  const mapping: Record<string, string> = {
    'sip-decline': 'SipDeclineVerb',
    'sip-request': 'SipRequestVerb',
    'sip-refer': 'SipReferVerb',
  };

  if (mapping[schemaBaseName]) return mapping[schemaBaseName];

  // Handle underscore-separated names (e.g. openai_s2s -> OpenaiS2sVerb)
  if (schemaBaseName.includes('_')) {
    return schemaBaseName
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('') + 'Verb';
  }

  // Regular verb: capitalize + append "Verb"
  return schemaBaseName.charAt(0).toUpperCase() + schemaBaseName.slice(1) + 'Verb';
}

describe('Schema drift detection', () => {
  const verbsSource = readFileSync(resolve(typesDir, 'verbs.ts'), 'utf-8');
  const componentsSource = readFileSync(resolve(typesDir, 'components.ts'), 'utf-8');

  describe('verb schemas match TypeScript interfaces', () => {
    // rest_dial is an internal server verb — no public TypeScript interface needed
    const SKIP_VERBS = ['rest_dial'];
    const verbFiles = readdirSync(verbsDir)
      .filter((f) => f.endsWith('.schema.json'))
      .filter((f) => !SKIP_VERBS.includes(basename(f, '.schema.json')));

    for (const file of verbFiles) {
      const schemaName = basename(file, '.schema.json');
      const interfaceName = schemaNameToInterface(schemaName, true);

      it(`${schemaName} schema properties match ${interfaceName}`, () => {
        const schema = JSON.parse(readFileSync(resolve(verbsDir, file), 'utf-8'));
        const schemaProps = [...Object.keys(schema.properties || {})];

        // Resolve allOf $ref to collect inherited properties
        if (schema.allOf) {
          for (const entry of schema.allOf) {
            if (entry.$ref) {
              const refPath = resolve(verbsDir, entry.$ref + '.schema.json');
              const refSchema = JSON.parse(readFileSync(refPath, 'utf-8'));
              schemaProps.push(...Object.keys(refSchema.properties || {}));
            }
            if (entry.properties) {
              schemaProps.push(...Object.keys(entry.properties));
            }
          }
        }

        // Deduplicate (e.g. 'vendor' may appear in both allOf base and local properties)
        const uniqueSchemaProps = [...new Set(schemaProps)].sort();
        const tsProps = parseInterfaceProps(verbsSource, interfaceName).sort();

        // Every schema property should exist in the TypeScript interface
        const missingInTs = uniqueSchemaProps.filter((p) => !tsProps.includes(p));
        // Every TS property should exist in the schema (except inherited ones)
        const extraInTs = tsProps.filter((p) => !uniqueSchemaProps.includes(p));

        expect(
          missingInTs,
          `${interfaceName} is missing schema properties: ${missingInTs.join(', ')}`
        ).toEqual([]);

        expect(
          extraInTs,
          `${interfaceName} has properties not in schema: ${extraInTs.join(', ')}`
        ).toEqual([]);
      });
    }
  });

  describe('component schemas match TypeScript interfaces', () => {
    const componentFiles = readdirSync(componentsDir).filter((f) => f.endsWith('.schema.json'));

    for (const file of componentFiles) {
      const schemaName = basename(file, '.schema.json');
      const interfaceName = schemaNameToInterface(schemaName, false);

      it(`${schemaName} schema properties match ${interfaceName}`, () => {
        const schema = JSON.parse(readFileSync(resolve(componentsDir, file), 'utf-8'));

        // Some component schemas define the component as a oneOf (string | object),
        // in that case the properties are on the object variant
        let schemaProps: string[];
        if (schema.properties) {
          schemaProps = Object.keys(schema.properties).sort();
        } else if (schema.oneOf) {
          const objVariant = schema.oneOf.find(
            (v: Record<string, unknown>) => v.type === 'object' && v.properties
          );
          schemaProps = objVariant ? Object.keys(objVariant.properties).sort() : [];
        } else {
          // Skip schemas that are simple types (e.g. actionHook is oneOf string|object)
          return;
        }

        if (schemaProps.length === 0) return;

        const tsProps = parseInterfaceProps(componentsSource, interfaceName).sort();

        // Skip if the TS type is a union type rather than an interface (e.g. ActionHook = string | {...})
        if (tsProps.length === 0) return;

        const missingInTs = schemaProps.filter((p) => !tsProps.includes(p));

        expect(
          missingInTs,
          `${interfaceName} is missing schema properties: ${missingInTs.join(', ')}`
        ).toEqual([]);
      });
    }
  });
});
