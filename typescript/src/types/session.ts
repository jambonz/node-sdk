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
  /** SIP reason phrase. */
  sip_reason?: string;
  /** Caller display name from the SIP From header. */
  caller_name?: string;
  /** Caller ID value (phone number or SIP user). */
  caller_id?: string;
  /** Call status. */
  call_status?: string;
  /** Name of the originating SIP trunk as configured in jambonz. */
  originating_sip_trunk_name?: string;
  /** IP address of the originating SIP trunk. */
  originating_sip_ip?: string;
  /** Service provider SID. */
  service_provider_sid?: string;
  /** Distributed tracing ID. */
  trace_id?: string;
  /** Call SID of the parent call (present for adulting / child call scenarios). */
  parent_call_sid?: string;
  /** jambonz REST API base URL for mid-call control. */
  api_base_url?: string;

  /**
   * Raw SIP INVITE message (drachtio SipRequest, serialized).
   * Only present for WebSocket and HTTP POST transports.
   * See https://drachtio.org/api#sip-request for the full API.
   */
  sip?: {
    /** SIP headers as key-value pairs. Custom X-* headers are included. */
    headers: Record<string, string>;
    /** SIP message body (typically SDP). */
    body?: string;
    /** SIP method (always 'INVITE' for session:new). */
    method?: string;
    /** Request-URI from the SIP INVITE. */
    uri?: string;
    /** Phone number extracted from the Request-URI. */
    calledNumber?: string;
    /** Calling phone number from P-Asserted-Identity or From header. */
    callingNumber?: string;
    /** Transport protocol (e.g. 'udp', 'tcp', 'tls'). */
    protocol?: string;
    /** IP address of the sender. */
    source_address?: string;
    /** Port of the sender. */
    source_port?: string | number;
  };

  /** Application environment variables configured in the jambonz portal. */
  env_vars?: Record<string, string>;

  /** Default speech settings for the account. */
  defaults?: {
    synthesizer?: { vendor?: string; language?: string; voice?: string };
    recognizer?: { vendor?: string; language?: string };
  };

  /** Custom data attached via the REST API when creating an outbound call. */
  customerData?: Record<string, unknown>;

  /** Additional properties. */
  [key: string]: unknown;
}

/** TTS streaming event types sent by jambonz. */
export type TtsStreamingEventType =
  | 'stream_open'
  | 'stream_paused'
  | 'stream_resumed'
  | 'stream_closed'
  | 'user_interruption'
  | 'tts_spoken';

/** Payload for tts:streaming-event messages. */
export interface TtsStreamingEvent {
  event_type: TtsStreamingEventType;
  /** The actual text spoken via TTS (present for tts_spoken events). */
  text?: string;
  /** Whether the user interrupted the TTS playout (present for tts_spoken events). */
  bargein?: boolean;
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
