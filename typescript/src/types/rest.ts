/**
 * Types for the jambonz REST API client.
 */

import type { ActionHook } from './components.js';
import type { Verb } from './verbs.js';

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
  /** SIP trunk to use. */
  trunk?: string;
  /** Custom SIP headers. */
  headers?: Record<string, string>;
  /** Tag metadata. */
  tag?: Record<string, unknown>;
  /** Max call duration in seconds. */
  timeout?: number;
}

export interface UpdateCallRequest {
  /** Redirect execution to a new webhook URL. */
  call_hook?: ActionHook;
  /** Redirect child call to a new webhook URL. */
  child_call_hook?: ActionHook;
  /** Status callback URL. */
  call_status_hook?: ActionHook;
  /** End the call. */
  call_status?: 'completed' | 'no-answer';
  /** Inject a verb (say/play) to one party on the call. */
  whisper?: Verb;
  /** Inject a dub track. */
  dub?: Verb;
  /** Mute/unmute the call. */
  mute_status?: 'mute' | 'unmute';
  /** Mute/unmute in conference. */
  conf_mute_status?: 'mute' | 'unmute';
  /** Hold/unhold in conference. */
  conf_hold_status?: 'hold' | 'unhold';
  /** Pause/resume audio streaming. */
  listen_status?: 'pause' | 'resume';
  /** Send a SIP request within the dialog. */
  sip_request?: { method: string; body?: string; headers?: Record<string, string> };
  /** Control media path. */
  media_path?: 'no-media' | 'partial-media' | 'full-media';
  /** Tag metadata. */
  tag?: Record<string, unknown>;
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
  duration: number;
  trunk?: string;
  [key: string]: unknown;
}

export interface SendMessageRequest {
  /** Sender phone number. */
  from: string;
  /** Destination phone number. */
  to: string;
  /** Message text. */
  text?: string;
  /** Media URLs for MMS. */
  media?: string | string[];
  /** Messaging carrier. */
  carrier?: string;
  /** Tag metadata. */
  tag?: Record<string, unknown>;
}

export interface MessageInfo {
  message_sid: string;
  [key: string]: unknown;
}
