import type { Logger } from 'pino';
import type { ModelClientOptions } from './model.js';
import type {
  ChatMessage,
  HarnessCommandArgs,
  HarnessEventMap,
  SessionEndMessage,
  SessionStartMessage,
  TurnInput,
  TurnRecord,
} from './protocol.js';

/** A turn as the hooks see it. */
export interface HarnessTurn {
  turnId: number;
  input: TurnInput;
  /** The caller's words (`''` for a greeting or no-input turn). */
  text: string;
}

/** A turn whose reply has finished, as `afterTurn` sees it. */
export interface CompletedTurn extends HarnessTurn {
  /** The text sent to text-to-speech for this turn. */
  reply: string;
  /** The turn record built so far; add to it with `ctx.record()`. */
  record: TurnRecord;
}

export interface CommandResult {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

export interface SayOptions {
  /** Cut off whatever reply is playing (the caller is still never talked over). */
  interrupt?: boolean;
  /** `false` holds barge-in until the whole reply has played. */
  interruptible?: boolean;
}

/** Per-call context passed to every hook. */
export interface HarnessContext {
  readonly callSid: string;
  /** The `session:start` message for this call (from, to, metadata, the agent's tools, ...). */
  readonly session: SessionStartMessage;
  /** Per-call state, yours to use. */
  readonly state: Map<string, unknown>;
  /**
   * The conversation so far: user, assistant and tool messages, oldest first. The system prompt is not
   * in it; it is built for each model call from `instructions`. You may edit it.
   */
  readonly history: ChatMessage[];
  /** A pino logger bound to this call's `call_sid`. */
  readonly log: Logger;
  /** Speak on the harness's own initiative (an unprompted reply). Returns the reply id. */
  say(text: string, opts?: SayOptions): string;
  /** Send a call-control command (A.8) and wait for its `command:result`. */
  command<N extends keyof HarnessCommandArgs>(name: N, args?: HarnessCommandArgs[N]): Promise<CommandResult>;
  command(name: string, args?: Record<string, unknown>): Promise<CommandResult>;
  /** Run one of the agent's Studio tools (a name from `session.tools`) via `tool:call`; resolves with its result. */
  callTool(name: string, args?: Record<string, unknown>): Promise<unknown>;
  /** Add a field to the current turn's record (or the next one, when called between turns). */
  record(field: string, value: unknown): void;
}

/** What `beforeModel` may return to shape the turn. Every field is optional. */
export interface BeforeModelResult {
  /** The system prompt for this turn's model calls (default: `options.instructions`). */
  instructions?: string;
  /**
   * The full message list to send instead of `[system, ...ctx.history]`. Include your own system message.
   * Tool round-trips during the turn are appended to it.
   */
  messages?: ChatMessage[];
  /** Names of the tools to offer the model this turn (your `tools` and the agent's Studio tools). Default: all. */
  tools?: string[];
  /** The model for this turn (default: `options.model`). */
  model?: string;
  /** Speak this and skip the model entirely. */
  reply?: string;
  /** Recorded as `turn_record.route`. */
  route?: string;
  /** `false` holds barge-in until this turn's reply has played. */
  interruptible?: boolean;
}

export interface HarnessTool {
  description: string;
  /** JSON schema for the arguments. */
  parameters?: Record<string, unknown>;
  run(args: Record<string, unknown>, ctx: HarnessContext): unknown | Promise<unknown>;
}

export type EventHandler<E> = (event: E, ctx: HarnessContext) => void | Promise<void>;

/** Handlers by event name (A.7). Events without a handler get the built-in behaviour, if any. */
export type EventHandlers = {
  [K in keyof HarnessEventMap]?: EventHandler<HarnessEventMap[K]>;
};

export interface HarnessOptions {
  /** The model used for every turn unless `beforeModel` says otherwise. Default `gpt-4.1-mini`. */
  model?: string;
  /** The system prompt. */
  instructions?: string;
  /** Speak this on the greeting turn instead of asking the model to greet. */
  greeting?: string;
  /** The OpenAI-compatible endpoint. Defaults from `OPENAI_API_KEY` / `OPENAI_BASE_URL`. */
  client?: ModelClientOptions;
  /** Extra chat-completion request fields (temperature, max_tokens, ...). */
  modelParams?: Record<string, unknown>;
  /** Most model calls in one turn when the model keeps calling tools. Default 5. */
  maxToolRounds?: number;
  /** Spoken when a turn fails (model or hook error) before anything was said. */
  errorReply?: string;

  /** When set, jambonz must send `Authorization: Bearer <apiKey>` (the Harness credential's key). */
  apiKey?: string;
  /** A pino logger. Default: pino at `LOG_LEVEL` (default `info`). */
  logger?: Logger;

  /** Once, when the call connects. Set up `ctx.state`. */
  onSessionStart?(session: SessionStartMessage, ctx: HarnessContext): void | Promise<void>;
  /** Each turn, before the model is called: routing, retrieval, gating, prompt assembly. */
  beforeModel?(turn: HarnessTurn, ctx: HarnessContext): BeforeModelResult | void | Promise<BeforeModelResult | void>;
  /** The harness's own tools. The agent's Studio tools are offered to the model too and run via `tool:call`. */
  tools?: Record<string, HarnessTool>;
  /** Before each sentence goes to TTS: `true` speaks it, `false` stops the reply, a string is spoken instead. */
  checkSentence?(sentence: string, ctx: HarnessContext): boolean | string | Promise<boolean | string>;
  /** When a turn's reply is done, before `reply:done` is sent. Add to the record with `ctx.record()`. */
  afterTurn?(turn: CompletedTurn, ctx: HarnessContext): void | Promise<void>;
  /** Per event name (`dtmf`, `silence`, `external`, `application_update`, ...). */
  onEvent?: EventHandlers;
  /** When the call ends. */
  onSessionEnd?(end: SessionEndMessage, ctx: HarnessContext): void | Promise<void>;
}

export interface HarnessServer {
  /** Start listening. Resolves with the bound address (use port 0 for an ephemeral port). */
  listen(opts: number | { port: number; host?: string }): Promise<{ port: number; host: string }>;
  /** Close every call's socket and stop listening. */
  close(): Promise<void>;
}
