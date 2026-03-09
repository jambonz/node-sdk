/**
 * Schema-based validation using AJV.
 * Loads all JSON schemas from schema/ and validates verb arrays and individual verbs.
 */

import Ajv, { type ValidateFunction, type ErrorObject } from 'ajv';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  path: string;
  message: string;
}

// Schema $id to file path mapping
const COMPONENT_SCHEMAS = [
  'auth',
  'actionHook',
  'actionHookDelayAction',
  'amd',
  'bidirectionalAudio',
  'fillerNoise',
  'recognizer',
  'recognizer-assemblyAiOptions',
  'recognizer-awsOptions',
  'recognizer-azureOptions',
  'recognizer-cobaltOptions',
  'recognizer-customOptions',
  'recognizer-deepgramOptions',
  'recognizer-elevenlabsOptions',
  'recognizer-gladiaOptions',
  'recognizer-googleOptions',
  'recognizer-houndifyOptions',
  'recognizer-ibmOptions',
  'recognizer-nuanceOptions',
  'recognizer-nvidiaOptions',
  'recognizer-openaiOptions',
  'recognizer-sonioxOptions',
  'recognizer-speechmaticsOptions',
  'recognizer-verbioOptions',
  'llm-base',
  'synthesizer',
  'target',
  'vad',
] as const;

const VERB_SCHEMAS = [
  'answer',
  'alert',
  'config',
  'say',
  'play',
  'gather',
  'dial',
  'listen',
  'stream',
  'llm',
  's2s',
  'openai_s2s',
  'google_s2s',
  'elevenlabs_s2s',
  'deepgram_s2s',
  'ultravox_s2s',
  'dialogflow',
  'pipeline',
  'conference',
  'transcribe',
  'enqueue',
  'dequeue',
  'dtmf',
  'dub',
  'hangup',
  'leave',
  'message',
  'pause',
  'redirect',
  'tag',
  'sip-decline',
  'sip-request',
  'sip-refer',
] as const;

function loadSchema(schemaDir: string, relativePath: string): Record<string, unknown> {
  const fullPath = resolve(schemaDir, relativePath);
  return JSON.parse(readFileSync(fullPath, 'utf-8')) as Record<string, unknown>;
}

function findSchemaDir(): string {
  // Walk up from this file to find the schema/ directory
  // In development: typescript/src/validator.ts -> ../../schema
  // In dist: dist/index.js -> ../schema (tsup bundles to package-root/dist/)
  const currentDir = typeof __dirname !== 'undefined'
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));

  // Try relative paths from both src and dist locations
  const candidates = [
    resolve(currentDir, '../../schema'),      // from typescript/src/
    resolve(currentDir, '../schema'),          // from dist/ (tsup bundles to package-root/dist/)
  ];

  for (const candidate of candidates) {
    try {
      readFileSync(resolve(candidate, 'jambonz-app.schema.json'), 'utf-8');
      return candidate;
    } catch {
      // try next
    }
  }

  throw new Error(
    'Could not find jambonz schema directory. Ensure the schema/ directory is present alongside the typescript/ directory.'
  );
}

export class JambonzValidator {
  private validateApp: ValidateFunction;
  private ajv: Ajv;

  constructor(schemaDir?: string) {
    const dir = schemaDir ?? findSchemaDir();
    this.ajv = new Ajv({
      allErrors: true,
      strict: false,
      validateSchema: false,
      logger: false,
    });

    // Register component schemas first (they are referenced by verb schemas)
    for (const name of COMPONENT_SCHEMAS) {
      const schema = loadSchema(dir, `components/${name}.schema.json`);
      this.ajv.addSchema(schema);
    }

    // Register verb schemas
    for (const name of VERB_SCHEMAS) {
      const schema = loadSchema(dir, `verbs/${name}.schema.json`);
      this.ajv.addSchema(schema);
    }

    // Compile the root app schema
    const appSchema = loadSchema(dir, 'jambonz-app.schema.json');
    this.validateApp = this.ajv.compile(appSchema);
  }

  /** Validate a complete verb array (a jambonz application). */
  validate(app: unknown): ValidationResult {
    const valid = this.validateApp(app);
    if (valid) {
      return { valid: true, errors: [] };
    }
    return {
      valid: false,
      errors: formatErrors(this.validateApp.errors),
    };
  }

  /** Validate a single verb object. */
  validateVerb(verb: unknown): ValidationResult {
    // Wrap in an array and validate as an app
    return this.validate([verb]);
  }
}

function formatErrors(errors: ErrorObject[] | null | undefined): ValidationError[] {
  if (!errors) return [];
  return errors.map((err) => ({
    path: err.instancePath || '/',
    message: err.message || 'Unknown validation error',
  }));
}

let _defaultValidator: JambonzValidator | null = null;

/** Get a shared validator instance. */
export function getValidator(schemaDir?: string): JambonzValidator {
  if (!_defaultValidator) {
    _defaultValidator = new JambonzValidator(schemaDir);
  }
  return _defaultValidator;
}
