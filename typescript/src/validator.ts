/**
 * Schema-based validation using AJV.
 * Loads all JSON schemas from the @jambonz/schema package.
 */

import Ajv, { type ValidateFunction, type ErrorObject } from 'ajv';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  path: string;
  message: string;
}

/** Locate the @jambonz/schema package directory. */
function findSchemaDir(): string {
  // Method 1: use createRequire to resolve the package
  try {
    const req = createRequire(import.meta.url);
    const schemaIndex = req.resolve('@jambonz/schema');
    const dir = resolve(schemaIndex, '..');
    if (existsSync(resolve(dir, 'jambonz-app.schema.json'))) {
      return dir;
    }
  } catch {
    // fall through
  }

  // Method 2: walk up from this file to find node_modules/@jambonz/schema
  const currentDir = typeof __dirname !== 'undefined'
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));

  let dir = currentDir;
  for (let i = 0; i < 10; i++) {
    const candidate = resolve(dir, 'node_modules', '@jambonz', 'schema');
    if (existsSync(resolve(candidate, 'jambonz-app.schema.json'))) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error(
    'Could not find @jambonz/schema package. Ensure it is installed as a dependency.'
  );
}

/** Discover schema files in a subdirectory. */
function discoverSchemas(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.schema.json'))
      .map((f) => basename(f, '.schema.json'));
  } catch {
    return [];
  }
}

function loadSchema(filePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
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
    const componentsDir = resolve(dir, 'components');
    for (const name of discoverSchemas(componentsDir)) {
      const schema = loadSchema(resolve(componentsDir, `${name}.schema.json`));
      this.ajv.addSchema(schema);
    }

    // Register verb schemas
    const verbsDir = resolve(dir, 'verbs');
    for (const name of discoverSchemas(verbsDir)) {
      const schema = loadSchema(resolve(verbsDir, `${name}.schema.json`));
      this.ajv.addSchema(schema);
    }

    // Compile the root app schema
    const appSchema = loadSchema(resolve(dir, 'jambonz-app.schema.json'));
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
