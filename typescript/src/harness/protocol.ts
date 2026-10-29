/**
 * The jambonz harness protocol (subprotocol `harness.jambonz.org`), protocol version 1.
 *
 * jambonz (feature-server) opens one WebSocket per call to the harness. Every frame is a
 * JSON text message with a `type`. Unknown types and fields must be ignored: new ones are
 * added without changing the protocol version.
 */

export const HARNESS_SUBPROTOCOL = 'harness.jambonz.org';
export const HARNESS_PROTOCOL_VERSION = 1;

/* ------------------------------------------------------------------ */
/* OpenAI chat-completion shapes (the subset the protocol relies on)  */
/* ------------------------------------------------------------------ */

/** A function tool definition, as passed to an OpenAI-compatible model. */
export interface ChatTool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface ChatToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ChatToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface ChatCompletionChunkDelta {
  role?: string;
  content?: string | null;
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: 'function';
    function?: { name?: string; arguments?: string };
  }>;
}

/** An OpenAI `ChatCompletionChunk`. Only `choices[0].delta.content` is spoken by jambonz. */
export interface ChatCompletionChunk {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices: Array<{
    index: number;
    delta: ChatCompletionChunkDelta;
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
  [key: string]: unknown;
}

/* ------------------------------------------------------------------ */
/* jambonz → harness (A.5)                                            */
/* ------------------------------------------------------------------ */

interface FromJambonz {
  call_sid: string;
}

export interface SessionStartMessage extends FromJambonz {
  type: 'session:start';
  protocol: number;
  account_sid?: string;
  application_sid?: string;
  direction?: 'inbound' | 'outbound';
  from?: string;
  to?: string;
  language?: string;
  sip_headers?: Record<string, string>;
  /** Free-form JSON from the verb (Studio puts agent id, version and per-call variables here). */
  metadata?: Record<string, unknown>;
  /** The agent's tools as OpenAI function definitions; run them with `tool:call`. */
  tools?: ChatTool[];
  /** True when jambonz reconnected after the socket dropped mid-call. */
  resumed?: boolean;
  /** On a resumed session, the last turn id jambonz knows of. */
  turn_id?: number;
}

export interface SpeechStartMessage extends FromJambonz {
  type: 'speech:start';
  turn_id: number;
}

export interface TranscriptMessage extends FromJambonz {
  type: 'transcript';
  turn_id: number;
  /** The whole utterance so far, not a delta. */
  text: string;
  /** The STT will not revise this text. It does not mean the caller has finished. */
  final: boolean;
  confidence?: number;
}

export type TurnInput =
  | { type: 'speech'; text: string; confidence?: number; language?: string }
  | { type: 'greeting' }
  | { type: 'no_input' };

export interface TurnStartMessage extends FromJambonz {
  type: 'turn:start';
  turn_id: number;
  input: TurnInput;
}

export interface TurnCancelMessage extends FromJambonz {
  type: 'turn:cancel';
  turn_id: number;
  reason: 'barge_in' | 'call_ended' | string;
}

export interface CommandResultMessage extends FromJambonz {
  type: 'command:result';
  command_id: string;
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

export interface ToolResultMessage extends FromJambonz {
  type: 'tool:result';
  call_id: string;
  result?: unknown;
  error?: string;
}

export interface SessionEndMessage extends FromJambonz {
  type: 'session:end';
  reason: 'caller_hangup' | 'harness_hangup' | 'application_hangup' | 'application_redirect' | 'error' | string;
  duration_ms?: number;
}

/* Events (A.7) */

export interface UserInterruptionEvent { name: 'user_interruption'; turn_id?: number; reply_id: string; spoken: string; unspoken?: string }
export interface ReplySpokenEvent { name: 'reply_spoken'; reply_id: string }
export interface ReplyDroppedEvent { name: 'reply_dropped'; reply_id: string; reason: 'replaced' | 'call_ended' | string }
export interface SilenceEvent { name: 'silence'; seconds?: number; streak: number; turn_id?: number }
export interface DtmfEvent { name: 'dtmf'; digits: string; duration_ms?: number }
export interface ExternalEvent { name: 'external'; event: string; variables?: Record<string, unknown> }
export interface TransferEvent { name: 'transfer'; command_id: string; outcome: 'bridged' | 'failed' | 'returned'; sip_status?: number; reason?: string }
export interface PlaybackEvent { name: 'playback'; command_id: string; outcome: string }
export interface RecordingEvent { name: 'recording'; command_id?: string; state: string; by: 'harness' | 'application' }
export interface ListenEvent { name: 'listen'; language?: string; hints?: string[]; by: string }
export interface ApplicationUpdateEvent { name: 'application_update'; type: string; data?: unknown }
export interface ErrorEvent { name: 'error'; code: string; message: string; ref?: unknown }

export type HarnessEvent =
  | UserInterruptionEvent
  | ReplySpokenEvent
  | ReplyDroppedEvent
  | SilenceEvent
  | DtmfEvent
  | ExternalEvent
  | TransferEvent
  | PlaybackEvent
  | RecordingEvent
  | ListenEvent
  | ApplicationUpdateEvent
  | ErrorEvent;

/** Maps an event name to its payload, for typed `onEvent` handlers. */
export type HarnessEventMap = { [E in HarnessEvent as E['name']]: E };

export type EventMessage = FromJambonz & { type: 'event' } & (HarnessEvent | { name: string; [key: string]: unknown });

export type JambonzToHarnessMessage =
  | SessionStartMessage
  | SpeechStartMessage
  | TranscriptMessage
  | TurnStartMessage
  | TurnCancelMessage
  | EventMessage
  | CommandResultMessage
  | ToolResultMessage
  | SessionEndMessage;

/* ------------------------------------------------------------------ */
/* harness → jambonz (A.6)                                            */
/* ------------------------------------------------------------------ */

export interface ReplyChunkMessage {
  type: 'reply:chunk';
  reply_id: string;
  /** Present when the reply answers a turn; absent for an unprompted reply. */
  turn_id?: number;
  /** `false` on the first chunk holds barge-in until the whole reply has played. */
  interruptible?: boolean;
  /** `true` on the first chunk of an unprompted reply cuts off whatever is playing. */
  interrupt?: boolean;
  chunk: ChatCompletionChunk;
}

/** The harness's account of a turn (A.13). Every field is optional; ≤ 16 KB as JSON. */
export interface TurnRecord {
  route?: string;
  procedures?: string[];
  steps?: Array<{ name: string; ms: number; result?: string; detail?: Record<string, unknown> }>;
  model_calls?: Array<{
    model: string;
    purpose?: string;
    input_tokens?: number;
    output_tokens?: number;
    first_token_ms?: number;
    ms: number;
  }>;
  own_tools?: Array<{ name: string; ok: boolean; ms: number }>;
  flags?: string[];
  note?: string;
  [key: string]: unknown;
}

export interface ReplyDoneMessage {
  type: 'reply:done';
  reply_id: string;
  turn_id?: number;
  turn_record?: TurnRecord;
}

export interface ToolCallMessage {
  type: 'tool:call';
  call_id: string;
  turn_id?: number;
  name: string;
  args: Record<string, unknown>;
}

/** Call-control commands (A.8). */
export interface HarnessCommandArgs {
  hangup: { reason?: string };
  transfer: { to: string; trunk?: string; headers?: Record<string, string>; announce?: string; transcribe?: boolean };
  play: { url: string; interruptible?: boolean };
  record: { action: 'start' | 'stop' | 'pause' | 'resume' };
  barge_in: { enabled: boolean };
  listen: { language?: string; hints?: string[] };
}

export type HarnessCommandName = keyof HarnessCommandArgs;

export interface CommandMessage {
  type: 'command';
  command_id: string;
  name: HarnessCommandName | string;
  args: Record<string, unknown>;
}

export type HarnessToJambonzMessage = ReplyChunkMessage | ReplyDoneMessage | ToolCallMessage | CommandMessage;
