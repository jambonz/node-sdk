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
