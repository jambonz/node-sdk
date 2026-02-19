/**
 * Types for call session data received from jambonz.
 */

/** Call session data provided in webhook requests and WebSocket session:new messages. */
export interface CallSession {
  /** Unique call identifier. */
  call_sid: string;
  /** Account identifier. */
  account_sid: string;
  /** Application identifier. */
  application_sid: string;
  /** Call direction. */
  direction: 'inbound' | 'outbound';
  /** Caller phone number or SIP URI. */
  from: string;
  /** Called phone number or SIP URI. */
  to: string;
  /** SIP Call-ID header. */
  call_id: string;
  /** SIP response status code. */
  sip_status: number;
  /** Caller display name. */
  caller_name?: string;
  /** Call status. */
  call_status?: string;
  /** SIP trunk name. */
  trunk?: string;
  /** Service provider SID. */
  service_provider_sid?: string;
  /** Distributed tracing ID. */
  trace_id?: string;
  /** Custom SIP headers from the INVITE. */
  sip_headers?: Record<string, string>;
  /** Additional properties. */
  [key: string]: unknown;
}

/** WebSocket message types received from jambonz. */
export type WsMessageType =
  | 'session:new'
  | 'session:adulting'
  | 'session:reconnect'
  | 'session:redirect'
  | 'verb:hook'
  | 'dial:confirm'
  | 'call:status'
  | 'verb:status'
  | 'llm:event'
  | 'llm:tool-call'
  | 'tts:streaming-event'
  | 'tts:tokens-result'
  | 'jambonz:error';

/** Inbound WebSocket message from jambonz. */
export interface WsMessage {
  type: WsMessageType;
  msgid: string;
  call_sid?: string;
  hook?: string;
  data?: Record<string, unknown>;
  b3?: string;
}

/** Outbound WebSocket message to jambonz. */
export interface WsResponse {
  type: 'ack' | 'command';
  msgid?: string;
  command?: string;
  queueCommand?: boolean;
  data?: unknown;
}
