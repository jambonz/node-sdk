/**
 * Verb types for all 26 jambonz verbs.
 * These map 1:1 to the JSON schemas in schema/verbs/.
 * The Verb discriminated union uses the 'verb' literal as the discriminator.
 */

import type {
  ActionHook,
  ActionHookDelayAction,
  Amd,
  Auth,
  BidirectionalAudio,
  FillerNoise,
  Recognizer,
  Synthesizer,
  Target,
  Vad,
} from './components.js';

// ---------------------------------------------------------------------------
// Audio & Speech
// ---------------------------------------------------------------------------

export interface SayVerb {
  verb: 'say';
  id?: string;
  /** Text to speak. Array selects one at random. */
  text: string | string[];
  /** Natural language instructions for TTS expression. */
  instructions?: string;
  /** Stream TTS audio incrementally. */
  stream?: boolean;
  /** Repeat count. 0 or 'forever' for indefinite. */
  loop?: number | string;
  /** Override session-level TTS config. */
  synthesizer?: Synthesizer;
  /** Play as early media before answering. */
  earlyMedia?: boolean;
  /** Bypass TTS cache. */
  disableTtsCache?: boolean;
  /** Close TTS stream on empty text. */
  closeStreamOnEmpty?: boolean;
}

export interface PlayVerb {
  verb: 'play';
  id?: string;
  /** Audio file URL(s). Array plays in sequence. */
  url: string | string[];
  /** Repeat count. 0 or 'forever' for indefinite. */
  loop?: number | string;
  /** Play as early media. */
  earlyMedia?: boolean;
  /** Start playback at this offset in seconds. */
  seekOffset?: number | string;
  /** Max playback duration in seconds. */
  timeoutSecs?: number | string;
  /** Webhook when playback completes. */
  actionHook?: ActionHook;
}

export interface GatherVerb {
  verb: 'gather';
  id?: string;
  /** Webhook to invoke with collected input. */
  actionHook?: ActionHook;
  /** Input types to accept. */
  input?: ('speech' | 'digits')[];
  /** DTMF key that signals end of input. */
  finishOnKey?: string;
  /** Exact number of digits to collect. */
  numDigits?: number;
  /** Minimum digits required. */
  minDigits?: number;
  /** Maximum digits to collect. */
  maxDigits?: number;
  /** Seconds between digits before input complete. */
  interDigitTimeout?: number;
  /** Seconds of silence after speech. */
  speechTimeout?: number;
  /** Overall timeout in seconds. */
  timeout?: number;
  /** Webhook for interim speech results. */
  partialResultHook?: ActionHook;
  /** Listen for input while prompt plays. */
  listenDuringPrompt?: boolean;
  /** DTMF interrupts playing prompt. */
  dtmfBargein?: boolean;
  /** Speech interrupts playing prompt. */
  bargein?: boolean;
  /** Minimum words before barge-in triggers. */
  minBargeinWordCount?: number;
  /** Override session-level STT config. */
  recognizer?: Recognizer;
  /** Nested say prompt (without 'verb' property). */
  say?: Omit<SayVerb, 'verb'>;
  /** Nested play prompt (without 'verb' property). */
  play?: Omit<PlayVerb, 'verb'>;
  /** Filler noise while waiting for actionHook. */
  fillerNoise?: FillerNoise;
  /** Handle slow actionHook responses. */
  actionHookDelayAction?: ActionHookDelayAction;
}

// ---------------------------------------------------------------------------
// AI & Real-time
// ---------------------------------------------------------------------------

export interface McpServerConfig {
  url: string;
  auth?: Record<string, unknown>;
  roots?: Record<string, unknown>[];
}

/** Shared properties for llm, s2s, and vendor-specific s2s verbs. */
export interface LlmBaseOptions {
  id?: string;
  /** LLM vendor. */
  vendor?: string;
  /** Model name. */
  model?: string;
  /** LLM vendor authentication. */
  auth?: { apiKey?: string; [key: string]: unknown };
  /** Additional connection options (e.g. custom base URLs). */
  connectOptions?: Record<string, unknown>;
  /** LLM configuration including messages, temperature, tools. */
  llmOptions: Record<string, unknown>;
  /** MCP servers for tool invocation. */
  mcpServers?: McpServerConfig[];
  /** Webhook when LLM conversation ends. */
  actionHook?: ActionHook;
  /** Webhook for real-time LLM events. */
  eventHook?: ActionHook;
  /** Webhook when LLM calls a tool. */
  toolHook?: ActionHook;
  /** Event types to receive via eventHook. */
  events?: string[];
}

export interface LlmVerb extends LlmBaseOptions {
  verb: 'llm';
  vendor: string;
}

export interface S2sVerb extends LlmBaseOptions {
  verb: 's2s';
  vendor: string;
}

export interface OpenaiS2sVerb extends LlmBaseOptions {
  verb: 'openai_s2s';
}

export interface GoogleS2sVerb extends LlmBaseOptions {
  verb: 'google_s2s';
}

export interface ElevenlabsS2sVerb extends LlmBaseOptions {
  verb: 'elevenlabs_s2s';
}

export interface DeepgramS2sVerb extends LlmBaseOptions {
  verb: 'deepgram_s2s';
}

export interface UltravoxS2sVerb extends LlmBaseOptions {
  verb: 'ultravox_s2s';
}

export interface DialogflowVerb {
  verb: 'dialogflow';
  id?: string;
  /** Google service account credentials as JSON object or stringified JSON. */
  credentials: Record<string, unknown> | string;
  /** Google Cloud project ID. */
  project: string;
  /** Dialogflow agent ID. Required for CX agents. */
  agent?: string;
  /** Dialogflow environment. */
  environment?: string;
  /** Google Cloud region for the API endpoint. */
  region?: string;
  /** Dialogflow model type. */
  model?: 'es' | 'cx' | 'ces';
  /** Language code (e.g. 'en-US'). */
  lang: string;
  /** Webhook when session ends. */
  actionHook?: ActionHook;
  /** Webhook for Dialogflow events. */
  eventHook?: ActionHook;
  /** Event types to receive via eventHook. */
  events?: string[];
  /** Event to trigger at conversation start. */
  welcomeEvent?: string;
  /** Parameters for the welcome event. */
  welcomeEventParams?: Record<string, unknown>;
  /** Seconds to wait for input before no-input event. */
  noInputTimeout?: number;
  /** Event to trigger on no input. */
  noInputEvent?: string;
  /** Pass DTMF digits as text input. */
  passDtmfAsTextInput?: boolean;
  /** Audio URL to play while waiting for Dialogflow. */
  thinkingMusic?: string;
  /** TTS configuration for responses. */
  tts?: Synthesizer;
  /** Allow caller to interrupt responses. */
  bargein?: boolean;
  /** Initial query input. */
  queryInput?: {
    text?: string;
    intent?: string;
    event?: string;
    dtmf?: string;
  };
}

export interface PipelineVerb {
  verb: 'pipeline';
  id?: string;
  /** STT configuration. */
  stt: Recognizer;
  /** TTS configuration. */
  tts: Synthesizer;
  /** Turn detection strategy. String shorthand ('stt' or 'krisp') or object with tunable params. */
  turnDetection?: 'stt' | 'krisp' | {
    mode: 'krisp';
    threshold?: number;
    model?: string;
  };
  /** Barge-in configuration — controls user interruption of assistant speech. */
  bargeIn?: {
    enable?: boolean;
    minSpeechDuration?: number;
    sticky?: boolean;
  };
  /** LLM configuration. */
  llm: Record<string, unknown>;
  /** Webhook when pipeline ends. */
  actionHook?: ActionHook;
  /** Webhook for pipeline events. */
  eventHook?: ActionHook;
  /** Webhook when the LLM requests a tool/function call. */
  toolHook?: ActionHook;
  /** Whether the LLM generates an initial greeting before the user speaks. Default: true. */
  greeting?: boolean;
  /** Speculatively prompt the LLM on final transcript before Krisp end-of-turn. Default: false. */
  earlyGeneration?: boolean;
}

export interface ListenVerb {
  verb: 'listen';
  id?: string;
  /** Websocket URL to stream audio to. */
  url: string;
  /** Webhook when listen ends. */
  actionHook?: ActionHook;
  /** Websocket auth credentials. */
  wsAuth?: Auth;
  /** Audio channel mixing mode. */
  mixType?: 'mono' | 'stereo' | 'mixed';
  /** Metadata sent with initial connection. */
  metadata?: Record<string, unknown>;
  /** Audio sample rate in Hz. */
  sampleRate?: number;
  /** DTMF key that ends the session. */
  finishOnKey?: string;
  /** Max duration in seconds. */
  maxLength?: number;
  /** Forward DTMF events to websocket. */
  passDtmf?: boolean;
  /** Play beep before streaming. */
  playBeep?: boolean;
  /** Disable receiving audio from websocket. */
  disableBidirectionalAudio?: boolean;
  /** Bidirectional audio configuration. */
  bidirectionalAudio?: BidirectionalAudio;
  /** Inactivity timeout in seconds. */
  timeout?: number;
  /** Simultaneous transcription config. */
  transcribe?: Omit<TranscribeVerb, 'verb'>;
  /** Stream before call is answered. */
  earlyMedia?: boolean;
  /** Specific audio channel to stream. */
  channel?: number;
}

export interface StreamVerb {
  verb: 'stream';
  id?: string;
  /** Websocket URL to stream audio to. */
  url: string;
  /** Webhook when stream ends. */
  actionHook?: ActionHook;
  /** Websocket auth credentials. */
  wsAuth?: Auth;
  /** Audio channel mixing mode. */
  mixType?: 'mono' | 'stereo' | 'mixed';
  /** Metadata sent with initial connection. */
  metadata?: Record<string, unknown>;
  /** Audio sample rate in Hz. */
  sampleRate?: number;
  /** DTMF key that ends the session. */
  finishOnKey?: string;
  /** Max duration in seconds. */
  maxLength?: number;
  /** Forward DTMF events to websocket. */
  passDtmf?: boolean;
  /** Play beep before streaming. */
  playBeep?: boolean;
  /** Disable receiving audio from websocket. */
  disableBidirectionalAudio?: boolean;
  /** Bidirectional audio configuration. */
  bidirectionalAudio?: BidirectionalAudio;
  /** Inactivity timeout in seconds. */
  timeout?: number;
  /** Simultaneous transcription config. */
  transcribe?: Omit<TranscribeVerb, 'verb'>;
  /** Stream before call is answered. */
  earlyMedia?: boolean;
  /** Specific audio channel to stream. */
  channel?: number;
}

export interface TranscribeVerb {
  verb: 'transcribe';
  id?: string;
  /** Enable or disable transcription (used in nested config/dial context). */
  enable?: boolean;
  /** Webhook for transcription results. */
  transcriptionHook?: string;
  /** Webhook for translated results. */
  translationHook?: string;
  /** STT configuration. */
  recognizer?: Recognizer;
  /** Transcribe before call is answered. */
  earlyMedia?: boolean;
  /** Specific audio channel to transcribe. */
  channel?: number;
}

// ---------------------------------------------------------------------------
// Call Control
// ---------------------------------------------------------------------------

export interface DialVerb {
  verb: 'dial';
  id?: string;
  /** Call targets (simultaneous ring). */
  target: Target[];
  /** Webhook when dialed call ends. */
  actionHook?: ActionHook;
  /** Webhook when call is placed on hold. */
  onHoldHook?: ActionHook;
  /** Delay answering inbound until outbound answers. */
  answerOnBridge?: boolean;
  /** Caller ID for outbound call. */
  callerId?: string;
  /** Caller display name. */
  callerName?: string;
  /** Webhook for call screening. */
  confirmHook?: ActionHook;
  /** Webhook for SIP REFER on bridged call. */
  referHook?: ActionHook;
  /** Audio URL for ringback tone replacement. */
  dialMusic?: string;
  /** DTMF capture patterns during bridged call. */
  dtmfCapture?: Record<string, unknown>;
  /** Webhook for captured DTMF patterns. */
  dtmfHook?: ActionHook;
  /** Custom SIP headers on outbound INVITE. */
  headers?: Record<string, string>;
  /** Keep media through jambonz media server. */
  anchorMedia?: boolean;
  /** Remove jambonz from media path after bridge. */
  exitMediaPath?: boolean;
  /** Audio signal boost/attenuation in dB. */
  boostAudioSignal?: number | string;
  /** Audio streaming config for bridged call. */
  listen?: Omit<ListenVerb, 'verb'>;
  /** Audio streaming config (alias for listen). */
  stream?: Omit<StreamVerb, 'verb'>;
  /** Transcription config for bridged call. */
  transcribe?: Omit<TranscribeVerb, 'verb'>;
  /** Max bridged call duration in seconds. */
  timeLimit?: number;
  /** Seconds to wait for answer. */
  timeout?: number;
  /** SIP proxy for outbound call. */
  proxy?: string;
  /** Answering machine detection config. */
  amd?: Amd;
  /** Audio dubbing tracks. */
  dub?: Omit<DubVerb, 'verb'>[];
  /** Metadata for this call leg. */
  tag?: Record<string, unknown>;
  /** Forward P-Asserted-Identity header. */
  forwardPAI?: boolean;
}

export interface ConferenceVerb {
  verb: 'conference';
  id?: string;
  /** Conference room name. */
  name: string;
  /** Beep on join/leave. */
  beep?: boolean;
  /** Tag to identify this participant. */
  memberTag?: string;
  /** Whisper to specific participant by tag. */
  speakOnlyTo?: string;
  /** Start conference when this participant joins. */
  startConferenceOnEnter?: boolean;
  /** End conference when this participant leaves. */
  endConferenceOnExit?: boolean;
  /** Max conference duration in seconds. */
  endConferenceDuration?: number;
  /** Max participants allowed. */
  maxParticipants?: number;
  /** Join muted. */
  joinMuted?: boolean;
  /** Webhook when participant leaves. */
  actionHook?: ActionHook;
  /** Webhook while waiting for conference to start. */
  waitHook?: ActionHook;
  /** Conference event types to receive. */
  statusEvents?: string[];
  /** Webhook for conference status events. */
  statusHook?: ActionHook;
  /** Webhook when participant enters. */
  enterHook?: ActionHook;
  /** Conference recording config. */
  record?: Record<string, unknown>;
  /** Audio streaming config. */
  listen?: Omit<ListenVerb, 'verb'>;
  /** Distribute DTMF to all participants. */
  distributeDtmf?: boolean;
}

export interface EnqueueVerb {
  verb: 'enqueue';
  id?: string;
  /** Queue name. */
  name: string;
  /** Webhook when caller leaves queue. */
  actionHook?: ActionHook;
  /** Webhook for hold content while waiting. */
  waitHook?: ActionHook;
  /** Queue priority (lower = higher priority). */
  priority?: number;
}

export interface DequeueVerb {
  verb: 'dequeue';
  id?: string;
  /** Queue name to dequeue from. */
  name: string;
  /** Webhook when dequeued call ends. */
  actionHook?: ActionHook;
  /** Seconds to wait for a caller in the queue. */
  timeout?: number;
  /** Beep when calls connect. */
  beep?: boolean;
  /** Dequeue a specific call by SID. */
  callSid?: string;
}

export interface HangupVerb {
  verb: 'hangup';
  id?: string;
  /** Custom SIP headers on the BYE request. */
  headers?: Record<string, string>;
}

export interface RedirectVerb {
  verb: 'redirect';
  id?: string;
  /** Webhook to transfer control to. */
  actionHook: ActionHook;
  /** Webhook for call status after redirect. */
  statusHook?: ActionHook;
}

export interface PauseVerb {
  verb: 'pause';
  id?: string;
  /** Duration in seconds. */
  length: number;
}

export interface LeaveVerb {
  verb: 'leave';
  id?: string;
}

// ---------------------------------------------------------------------------
// SIP
// ---------------------------------------------------------------------------

export interface SipDeclineVerb {
  verb: 'sip:decline';
  id?: string;
  /** SIP response status code. */
  status: number;
  /** SIP reason phrase. */
  reason?: string;
  /** Custom SIP headers. */
  headers?: Record<string, string>;
}

export interface SipRequestVerb {
  verb: 'sip:request';
  id?: string;
  /** SIP method (e.g. 'INFO', 'NOTIFY'). */
  method: string;
  /** Request body. */
  body?: string;
  /** Custom SIP headers. */
  headers?: Record<string, string>;
  /** Webhook for the SIP response. */
  actionHook?: ActionHook;
}

export interface SipReferVerb {
  verb: 'sip:refer';
  id?: string;
  /** SIP URI or phone number to transfer to. */
  referTo: string;
  /** Referred-By header value. */
  referredBy?: string;
  /** Display name for Referred-By. */
  referredByDisplayName?: string;
  /** Custom SIP headers. */
  headers?: Record<string, string>;
  /** Webhook when REFER completes. */
  actionHook?: ActionHook;
  /** Webhook for NOTIFY progress events. */
  eventHook?: ActionHook;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

export interface ConfigVerb {
  verb: 'config';
  id?: string;
  /** Default TTS configuration. */
  synthesizer?: Synthesizer;
  /** Default STT configuration. */
  recognizer?: Recognizer;
  /** Default barge-in configuration. */
  bargeIn?: {
    enable?: boolean;
    sticky?: boolean;
    actionHook?: ActionHook;
    input?: ('speech' | 'digits')[];
    minBargeinWordCount?: number;
  };
  /** Default TTS streaming config. */
  ttsStream?: {
    enable?: boolean;
    synthesizer?: Synthesizer;
  };
  /** Session-level recording config. */
  record?: Record<string, unknown>;
  /** Session-level audio streaming config. */
  listen?: Omit<ListenVerb, 'verb'>;
  /** Session-level audio streaming (alias). */
  stream?: Omit<StreamVerb, 'verb'>;
  /** Session-level transcription config. */
  transcribe?: Omit<TranscribeVerb, 'verb'>;
  /** Answering machine detection config. */
  amd?: Amd;
  /** Default filler noise config. */
  fillerNoise?: FillerNoise;
  /** Default VAD config. */
  vad?: Vad;
  /** Send call events to status webhook. */
  notifyEvents?: boolean;
  /** Include STT latency measurements. */
  notifySttLatency?: boolean;
  /** Reset specific session settings to defaults. */
  reset?: string | string[];
  /** Hold music audio URL. */
  onHoldMusic?: string;
  /** Default slow webhook response handling. */
  actionHookDelayAction?: ActionHookDelayAction;
  /** Webhook for in-dialog SIP requests. */
  sipRequestWithinDialogHook?: ActionHook;
  /** Audio signal boost/attenuation in dB. */
  boostAudioSignal?: number | string;
  /** Webhook for SIP REFER requests. */
  referHook?: ActionHook;
  /** Allow early media for the session. */
  earlyMedia?: boolean;
  /** Auto-stream TTS for all say verbs. */
  autoStreamTts?: boolean;
  /** Disable TTS caching. */
  disableTtsCache?: boolean;
  /** Noise isolation config. */
  noiseIsolation?: {
    enable?: boolean;
    vendor?: string;
    level?: number;
    model?: string;
  };
  /** Turn-taking detection config. */
  turnTaking?: {
    enable?: boolean;
    vendor?: string;
    threshold?: number;
    model?: string;
  };
}

export interface AnswerVerb {
  verb: 'answer';
  id?: string;
}

export interface AlertVerb {
  verb: 'alert';
  id?: string;
  /** Alert-Info header value. */
  message: string;
}

export interface TagVerb {
  verb: 'tag';
  id?: string;
  /** Metadata to attach to the call. */
  data: Record<string, unknown>;
}

export interface DtmfVerb {
  verb: 'dtmf';
  id?: string;
  /** DTMF digits to send. 'w' for 500ms pause. */
  dtmf: string;
  /** Duration per tone in milliseconds. */
  duration?: number;
}

export interface DubVerb {
  verb: 'dub';
  id?: string;
  /** Dubbing action. */
  action: 'addTrack' | 'removeTrack' | 'silenceTrack' | 'playOnTrack' | 'sayOnTrack';
  /** Track name. */
  track: string;
  /** Audio URL for playOnTrack. */
  play?: string;
  /** Text or config for sayOnTrack. */
  say?: string | Omit<SayVerb, 'verb'>;
  /** Loop audio continuously. */
  loop?: boolean;
  /** Track gain in dB. */
  gain?: number | string;
}

export interface MessageVerb {
  verb: 'message';
  id?: string;
  /** Destination phone number (E.164). */
  to: string;
  /** Sender phone number (E.164). */
  from: string;
  /** Message text content. */
  text?: string;
  /** Media attachment URL(s) for MMS. */
  media?: string | string[];
  /** Messaging carrier to use. */
  carrier?: string;
  /** Account SID for sending. */
  account_sid?: string;
  /** Message SID for tracking. */
  message_sid?: string;
  /** Webhook when send completes. */
  actionHook?: ActionHook;
}

// ---------------------------------------------------------------------------
// Discriminated Union
// ---------------------------------------------------------------------------

/** Any jambonz verb. Discriminated on the 'verb' property. */
export type Verb =
  | AnswerVerb
  | AlertVerb
  | ConfigVerb
  | SayVerb
  | PlayVerb
  | GatherVerb
  | DialVerb
  | ListenVerb
  | StreamVerb
  | LlmVerb
  | S2sVerb
  | OpenaiS2sVerb
  | GoogleS2sVerb
  | ElevenlabsS2sVerb
  | DeepgramS2sVerb
  | UltravoxS2sVerb
  | DialogflowVerb
  | PipelineVerb
  | ConferenceVerb
  | TranscribeVerb
  | EnqueueVerb
  | DequeueVerb
  | DtmfVerb
  | DubVerb
  | HangupVerb
  | LeaveVerb
  | MessageVerb
  | PauseVerb
  | RedirectVerb
  | TagVerb
  | SipDeclineVerb
  | SipRequestVerb
  | SipReferVerb;

/** A jambonz application — an array of verbs executed sequentially. */
export type JambonzApp = Verb[];

/** All valid verb names. */
export type VerbName = Verb['verb'];
