/**
 * Shared VerbBuilder base class.
 * Provides typed verb methods and raw JSON input for both WebhookResponse and WS Session.
 */

import type {
  AlertVerb,
  AnswerVerb,
  ConferenceVerb,
  ConfigVerb,
  DequeueVerb,
  DialVerb,
  DtmfVerb,
  DubVerb,
  EnqueueVerb,
  GatherVerb,
  HangupVerb,
  LeaveVerb,
  ListenVerb,
  LlmVerb,
  MessageVerb,
  PauseVerb,
  PipelineVerb,
  PlayVerb,
  RedirectVerb,
  SayVerb,
  SipDeclineVerb,
  SipReferVerb,
  SipRequestVerb,
  StreamVerb,
  TagVerb,
  TranscribeVerb,
  Verb,
} from './types/verbs.js';
import { JambonzValidator } from './validator.js';

export interface VerbBuilderOptions {
  /** Enable runtime schema validation. Default: true. */
  validate?: boolean;
  /** Path to schema directory. Auto-detected if omitted. */
  schemaDir?: string;
}

/**
 * Base class for building jambonz verb arrays. Extended by {@link WebhookResponse}
 * and WsSession. Provides typed verb methods and optional runtime schema validation.
 */
export class VerbBuilder {
  protected verbs: Verb[] = [];
  protected validator: JambonzValidator | null;

  /**
   * @param opts - Options for validation and schema directory.
   */
  constructor(opts?: VerbBuilderOptions) {
    if (opts?.validate === false) {
      this.validator = null;
    } else {
      this.validator = new JambonzValidator(opts?.schemaDir);
    }
  }

  // --- Audio & Speech ---

  /** Speak text using TTS. Supports SSML, multiple voices, and streaming. */
  say(opts: Omit<SayVerb, 'verb'>): this {
    return this.addVerb({ verb: 'say', ...opts });
  }

  /** Play an audio file from a URL. */
  play(opts: Omit<PlayVerb, 'verb'>): this {
    return this.addVerb({ verb: 'play', ...opts });
  }

  /** Collect speech (STT) and/or DTMF input from the caller. */
  gather(opts: Omit<GatherVerb, 'verb'>): this {
    return this.addVerb({ verb: 'gather', ...opts });
  }

  // --- AI & Real-time ---

  /** Connect the caller to an LLM for real-time voice conversation. */
  llm(opts: Omit<LlmVerb, 'verb'>): this {
    return this.addVerb({ verb: 'llm', ...opts });
  }

  /** Voice AI pipeline with integrated turn detection. */
  pipeline(opts: Omit<PipelineVerb, 'verb'>): this {
    return this.addVerb({ verb: 'pipeline', ...opts });
  }

  /** Stream real-time call audio to a WebSocket endpoint. Supports bidirectional audio. */
  listen(opts: Omit<ListenVerb, 'verb'>): this {
    return this.addVerb({ verb: 'listen', ...opts });
  }

  /** Stream real-time call audio to a WebSocket endpoint. Synonym for {@link listen}. */
  stream(opts: Omit<StreamVerb, 'verb'>): this {
    return this.addVerb({ verb: 'stream', ...opts });
  }

  /** Real-time call transcription sent to a webhook. */
  transcribe(opts: Omit<TranscribeVerb, 'verb'>): this {
    return this.addVerb({ verb: 'transcribe', ...opts });
  }

  // --- Call Control ---

  /** Place an outbound call and bridge it to the current caller. */
  dial(opts: Omit<DialVerb, 'verb'>): this {
    return this.addVerb({ verb: 'dial', ...opts });
  }

  /** Join or create a multi-party conference room. */
  conference(opts: Omit<ConferenceVerb, 'verb'>): this {
    return this.addVerb({ verb: 'conference', ...opts });
  }

  /** Place the caller into a named queue. */
  enqueue(opts: Omit<EnqueueVerb, 'verb'>): this {
    return this.addVerb({ verb: 'enqueue', ...opts });
  }

  /** Remove a caller from a queue and bridge them. */
  dequeue(opts: Omit<DequeueVerb, 'verb'>): this {
    return this.addVerb({ verb: 'dequeue', ...opts });
  }

  /** End the call. */
  hangup(opts?: Omit<HangupVerb, 'verb'>): this {
    return this.addVerb({ verb: 'hangup', ...opts });
  }

  /** Transfer control to a different webhook URL. */
  redirect(opts: Omit<RedirectVerb, 'verb'>): this {
    return this.addVerb({ verb: 'redirect', ...opts });
  }

  /** Wait for a specified duration before continuing. */
  pause(opts: Omit<PauseVerb, 'verb'>): this {
    return this.addVerb({ verb: 'pause', ...opts });
  }

  /** Leave a conference or queue. */
  leave(opts?: Omit<LeaveVerb, 'verb'>): this {
    return this.addVerb({ verb: 'leave', ...opts });
  }

  // --- SIP ---

  /** Reject an incoming call with a SIP error response. */
  sipDecline(opts: Omit<SipDeclineVerb, 'verb'>): this {
    return this.addVerb({ verb: 'sip:decline', ...opts });
  }

  /** Send a SIP INFO or other request within the dialog. */
  sipRequest(opts: Omit<SipRequestVerb, 'verb'>): this {
    return this.addVerb({ verb: 'sip:request', ...opts });
  }

  /** Transfer the call via SIP REFER. */
  sipRefer(opts: Omit<SipReferVerb, 'verb'>): this {
    return this.addVerb({ verb: 'sip:refer', ...opts });
  }

  // --- Utility ---

  /** Set session-level defaults (TTS vendor/voice, STT vendor, VAD, etc.). */
  config(opts: Omit<ConfigVerb, 'verb'>): this {
    return this.addVerb({ verb: 'config', ...opts });
  }

  /** Explicitly answer the call (sends a 200 OK). */
  answer(opts?: Omit<AnswerVerb, 'verb'>): this {
    return this.addVerb({ verb: 'answer', ...opts });
  }

  /** Send a SIP 180 Ringing with optional Alert-Info header. */
  alert(opts: Omit<AlertVerb, 'verb'>): this {
    return this.addVerb({ verb: 'alert', ...opts });
  }

  /** Attach metadata to the call for tracking or routing. */
  tag(opts: Omit<TagVerb, 'verb'>): this {
    return this.addVerb({ verb: 'tag', ...opts });
  }

  /** Send DTMF tones into the call. */
  dtmf(opts: Omit<DtmfVerb, 'verb'>): this {
    return this.addVerb({ verb: 'dtmf', ...opts });
  }

  /** Mix an auxiliary audio track into the call. */
  dub(opts: Omit<DubVerb, 'verb'>): this {
    return this.addVerb({ verb: 'dub', ...opts });
  }

  /** Send an SMS or MMS message. */
  message(opts: Omit<MessageVerb, 'verb'>): this {
    return this.addVerb({ verb: 'message', ...opts });
  }

  // --- Raw JSON input (primary AI agent path) ---

  /**
   * Add one or more verbs from raw JSON.
   * Validates against the JSON schemas at runtime if validation is enabled.
   */
  addVerbs(verbs: Verb[]): this {
    if (this.validator) {
      const result = this.validator.validate(verbs);
      if (!result.valid) {
        const messages = result.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
        throw new Error(`Verb validation failed: ${messages}`);
      }
    }
    this.verbs.push(...verbs);
    return this;
  }

  // --- Internal ---

  protected addVerb(verb: Verb): this {
    if (this.validator) {
      const result = this.validator.validateVerb(verb);
      if (!result.valid) {
        const messages = result.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
        throw new Error(`Verb '${verb.verb}' validation failed: ${messages}`);
      }
    }
    this.verbs.push(verb);
    return this;
  }

  /** Get the current verb count. */
  get length(): number {
    return this.verbs.length;
  }

  /** Clear all queued verbs. */
  clear(): this {
    this.verbs = [];
    return this;
  }

  /** Returns a copy of the current verb array. */
  toJSON(): Verb[] {
    return [...this.verbs];
  }
}
