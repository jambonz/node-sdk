/**
 * Common types and re-exports.
 */

export type { JambonzApp, Verb, VerbName } from './verbs.js';
export type { CallSession, WsMessage, WsMessageType, WsResponse } from './session.js';

/** Logger interface expected by SDK components. */
export interface Logger {
  info: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  child?: (bindings: Record<string, unknown>) => Logger;
}

/** Definition of a single application environment variable. */
export interface EnvVarDef {
  /** Value type. */
  type: 'string' | 'number' | 'boolean';
  /** Human-readable description shown in the jambonz portal. */
  description: string;
  /** Whether the user must provide a value. */
  required?: boolean;
  /** Default value pre-filled in the portal UI. */
  default?: string | number | boolean;
  /** Allowed values — renders as a dropdown in the portal. */
  enum?: (string | number | boolean)[];
  /** Mask the value in the portal UI (for secrets/API keys). */
  obscure?: boolean;
}

/** Schema declaring all application environment variables. */
export type EnvVarSchema = Record<string, EnvVarDef>;
