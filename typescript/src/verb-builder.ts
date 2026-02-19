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

export class VerbBuilder {
  protected verbs: Verb[] = [];
  protected validator: JambonzValidator | null;

  constructor(opts?: VerbBuilderOptions) {
    if (opts?.validate === false) {
      this.validator = null;
    } else {
      this.validator = new JambonzValidator(opts?.schemaDir);
    }
  }

  // --- Audio & Speech ---

  say(opts: Omit<SayVerb, 'verb'>): this {
    return this.addVerb({ verb: 'say', ...opts });
  }

  play(opts: Omit<PlayVerb, 'verb'>): this {
    return this.addVerb({ verb: 'play', ...opts });
  }

  gather(opts: Omit<GatherVerb, 'verb'>): this {
    return this.addVerb({ verb: 'gather', ...opts });
  }

  // --- AI & Real-time ---

  llm(opts: Omit<LlmVerb, 'verb'>): this {
    return this.addVerb({ verb: 'llm', ...opts });
  }

  pipeline(opts: Omit<PipelineVerb, 'verb'>): this {
    return this.addVerb({ verb: 'pipeline', ...opts });
  }

  listen(opts: Omit<ListenVerb, 'verb'>): this {
    return this.addVerb({ verb: 'listen', ...opts });
  }

  stream(opts: Omit<StreamVerb, 'verb'>): this {
    return this.addVerb({ verb: 'stream', ...opts });
  }

  transcribe(opts: Omit<TranscribeVerb, 'verb'>): this {
    return this.addVerb({ verb: 'transcribe', ...opts });
  }

  // --- Call Control ---

  dial(opts: Omit<DialVerb, 'verb'>): this {
    return this.addVerb({ verb: 'dial', ...opts });
  }

  conference(opts: Omit<ConferenceVerb, 'verb'>): this {
    return this.addVerb({ verb: 'conference', ...opts });
  }

  enqueue(opts: Omit<EnqueueVerb, 'verb'>): this {
    return this.addVerb({ verb: 'enqueue', ...opts });
  }

  dequeue(opts: Omit<DequeueVerb, 'verb'>): this {
    return this.addVerb({ verb: 'dequeue', ...opts });
  }

  hangup(opts?: Omit<HangupVerb, 'verb'>): this {
    return this.addVerb({ verb: 'hangup', ...opts });
  }

  redirect(opts: Omit<RedirectVerb, 'verb'>): this {
    return this.addVerb({ verb: 'redirect', ...opts });
  }

  pause(opts: Omit<PauseVerb, 'verb'>): this {
    return this.addVerb({ verb: 'pause', ...opts });
  }

  leave(opts?: Omit<LeaveVerb, 'verb'>): this {
    return this.addVerb({ verb: 'leave', ...opts });
  }

  // --- SIP ---

  sipDecline(opts: Omit<SipDeclineVerb, 'verb'>): this {
    return this.addVerb({ verb: 'sip:decline', ...opts });
  }

  sipRequest(opts: Omit<SipRequestVerb, 'verb'>): this {
    return this.addVerb({ verb: 'sip:request', ...opts });
  }

  sipRefer(opts: Omit<SipReferVerb, 'verb'>): this {
    return this.addVerb({ verb: 'sip:refer', ...opts });
  }

  // --- Utility ---

  config(opts: Omit<ConfigVerb, 'verb'>): this {
    return this.addVerb({ verb: 'config', ...opts });
  }

  answer(opts?: Omit<AnswerVerb, 'verb'>): this {
    return this.addVerb({ verb: 'answer', ...opts });
  }

  alert(opts: Omit<AlertVerb, 'verb'>): this {
    return this.addVerb({ verb: 'alert', ...opts });
  }

  tag(opts: Omit<TagVerb, 'verb'>): this {
    return this.addVerb({ verb: 'tag', ...opts });
  }

  dtmf(opts: Omit<DtmfVerb, 'verb'>): this {
    return this.addVerb({ verb: 'dtmf', ...opts });
  }

  dub(opts: Omit<DubVerb, 'verb'>): this {
    return this.addVerb({ verb: 'dub', ...opts });
  }

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
