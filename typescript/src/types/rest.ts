/**
 * Types for the jambonz REST API client.
 */

import type { ActionHook } from './components.js';
import type { SayVerb, TransferVerb, Verb } from './verbs.js';

export interface CreateCallRequest {
  /** Application SID to handle the call. */
  application_sid?: string;
  /** Webhook URL for the call. */
  call_hook?: ActionHook;
  /** Status callback URL. */
  call_status_hook?: ActionHook;
  /** Caller ID. */
  from: string;
  /** Destination number or SIP URI. */
  to: {
    type: 'phone' | 'sip' | 'user' | 'teams';
    number?: string;
    sipUri?: string;
    name?: string;
    tenant?: string;
  };
  /** Ring until outbound call answers before sending 200 OK. */
  answerOnBridge?: boolean;
  /** SIP trunk to use. */
  trunk?: string;
  /** Hostname for SIP From header. */
  fromHost?: string;
  /** Custom SIP headers. */
  headers?: Record<string, string>;
  /** Tag metadata. */
  tag?: Record<string, unknown>;
  /** Seconds to wait for answer (default: 60). */
  timeout?: number;
  /** Maximum call duration in seconds. */
  timeLimit?: number;
  /** Webhook for SIP requests within the dialog. */
  sipRequestWithinDialogHook?: ActionHook;
  /** TTS vendor (required when not using application_sid). */
  speech_synthesis_vendor?: string;
  /** TTS language. */
  speech_synthesis_language?: string;
  /** TTS voice. */
  speech_synthesis_voice?: string;
  /** STT vendor (required when not using application_sid). */
  speech_recognizer_vendor?: string;
  /** STT language. */
  speech_recognizer_language?: string;
  /** Answering machine detection settings. */
  amd?: Record<string, unknown>;
}

export interface UpdateCallRequest {
  /** Redirect execution to a new webhook URL. */
  call_hook?: ActionHook;
  /** Redirect child call to a new webhook URL. */
  child_call_hook?: ActionHook;
  /** End the call. */
  call_status?: 'completed' | 'no-answer';
  /** Inject a verb (say/play) to one party on the call. */
  whisper?: Verb;
  /** Inject a dub track. */
  dub?: Verb;
  /** Mute/unmute the call. */
  mute_status?: 'mute' | 'unmute';
  /** Enable/disable server-side noise isolation. */
  noise_isolation_status?: 'enable' | 'disable';
  /** Noise isolation vendor (default: krisp). */
  noise_isolation_vendor?: string;
  /** Noise isolation level (0-100). */
  noise_isolation_level?: number;
  /** Noise isolation model. */
  noise_isolation_model?: string;
  /** Mute/unmute in conference. */
  conf_mute_status?: 'mute' | 'unmute';
  /** Hold/unhold in conference. */
  conf_hold_status?: 'hold' | 'unhold';
  /** Pause/silence/resume audio streaming. */
  listen_status?: 'pause' | 'silence' | 'resume';
  /** Pause/resume live transcription. */
  transcribe_status?: 'pause' | 'resume';
  /**
   * Move a live speech-to-speech (llm verb) session into a conference and back,
   * or stop it. `move-to-conference` also joins the caller into `conference`
   * (created if it does not exist) so both legs end up in the room, the vendor
   * WebSocket preserved.
   */
  llm_status?: 'move-to-conference' | 'move-from-conference' | 'stop';
  /** Conference (room) name for `llm_status: 'move-to-conference'`. */
  conference?: string;
  /**
   * Speak one-shot TTS into the room (conference) the call is in, heard by every
   * member. Mirrors the `say` verb; `id` is an optional correlation id echoed in
   * the `say-start`/`say-done` events, `replace` ends any in-flight room say/play
   * first. (Streaming — `stream: true` — is not yet supported.)
   */
  room_say?: Omit<SayVerb, 'verb'> & { replace?: boolean };
  /** Play a file/tone into the room the call is in, heard by every member. */
  room_play?: { url: string; id?: string; replace?: boolean };
  /** Send a SIP request within the dialog. */
  sip_request?: { method: string; content_type?: string; content?: string; headers?: Record<string, string> };
  /** Control call recording. */
  record?: {
    action: 'startCallRecording' | 'stopCallRecording' | 'pauseCallRecording' | 'resumeCallRecording';
    recordingID?: string;
    siprecServerURL?: string;
  };
  /** Conference participant action. */
  conferenceParticipantAction?: {
    action: 'tag' | 'untag' | 'coach' | 'uncoach' | 'mute' | 'unmute' | 'hold' | 'unhold';
    tag?: string;
  };
  /** Send DTMF digits. */
  dtmf?: { digit: string; duration?: number };
  /** Redirect the in-progress call to a packaged transfer (blind or warm). */
  transfer?: Omit<TransferVerb, 'verb'>;
  /** Tag metadata. */
  tag?: Record<string, unknown>;
  /** Mid-conversation agent update. */
  agent_update?: {
    type: 'update_instructions' | 'inject_context' | 'update_tools' | 'generate_reply';
    instructions?: string;
    messages?: Array<{ role: string; content: string }>;
    tools?: unknown[];
    user_input?: string;
    interrupt?: boolean;
  };
}

export interface ListCallsFilter {
  /** Filter by call direction. */
  direction?: 'inbound' | 'outbound';
  /** Filter by calling number. */
  from?: string;
  /** Filter by called number. */
  to?: string;
  /** Filter by call status. */
  callStatus?: 'trying' | 'ringing' | 'early-media' | 'in-progress' | 'completed' | 'failed' | 'busy' | 'no-answer' | 'queued';
}

export interface CallInfo {
  call_sid: string;
  account_sid: string;
  application_sid: string;
  call_id: string;
  call_status: string;
  direction: string;
  from: string;
  to: string;
  sip_status?: number;
  duration: number;
  caller_name?: string;
  originating_sip_trunk_name?: string;
  parent_call_sid?: string;
  service_url?: string;
  [key: string]: unknown;
}

export interface CallCount {
  inbound: number;
  outbound: number;
}

export interface QueueInfo {
  name: string;
  length: string;
}

