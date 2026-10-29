/**
 * HarnessCall — the state and behaviour of one call on the harness socket.
 */

import type { WebSocket } from 'ws';
import type { Logger } from 'pino';
import type { ModelClient } from './model.js';
import { SentenceSplitter } from './sentences.js';
import type {
  ChatCompletionChunk,
  ChatMessage,
  ChatTool,
  ChatToolCall,
  HarnessToJambonzMessage,
  JambonzToHarnessMessage,
  SessionEndMessage,
  SessionStartMessage,
  SilenceEvent,
  TurnRecord,
  TurnStartMessage,
  UserInterruptionEvent,
} from './protocol.js';
import type { BeforeModelResult, CommandResult, HarnessContext, HarnessOptions, HarnessTurn, SayOptions } from './types.js';

const COMMAND_TIMEOUT_MS = 30_000;
const TOOL_TIMEOUT_MS = 60_000;
const SPOKEN_WAIT_MS = 15_000;
const MAX_TRACKED_REPLIES = 20;
const MAX_TURN_RECORD_BYTES = 16 * 1024;

export const SILENCE_REPROMPT = 'Are you still there?';
export const SILENCE_GOODBYE = "I haven't heard from you, so I'll end the call now. Goodbye.";
const DEFAULT_ERROR_REPLY = "Sorry, I'm having trouble right now. Could you say that again?";
const GREETING_PROMPT = '(The call has just connected. Greet the caller.)';

const now = () => performance.now();
const ms = (since: number) => Math.round(performance.now() - since);

interface TurnRun {
  turnId: number;
  controller: AbortController;
}

/** Builds the A.13 turn record. */
class TurnRecorder {
  readonly record: TurnRecord = {};
  step(name: string, took: number, result?: string, detail?: Record<string, unknown>) {
    (this.record.steps ??= []).push({ name, ms: took, ...(result ? { result } : {}), ...(detail ? { detail } : {}) });
  }
  modelCall(call: NonNullable<TurnRecord['model_calls']>[number]) {
    (this.record.model_calls ??= []).push(call);
  }
  ownTool(name: string, ok: boolean, took: number) {
    (this.record.own_tools ??= []).push({ name, ok, ms: took });
  }
}

/** Sends one reply: chunks (through `checkSentence` when set), its history messages, and its text. */
class ReplyWriter {
  started = false;
  stopped = false;
  /** Everything released to TTS. */
  text = '';
  /** The history message for the current model round, created when its first text is released. */
  private segmentMsg?: AssistantMessage;
  private splitter = new SentenceSplitter();
  private meta?: ChatCompletionChunk;
  private checks = { count: 0, ms: 0, replaced: 0 };

  constructor(
    private call: HarnessCall,
    readonly replyId: string,
    private turnId: number | undefined,
    private signal: AbortSignal | undefined,
    private first: { interruptible?: boolean; interrupt?: boolean },
    private check: HarnessOptions['checkSentence'],
  ) {}

  /** Streamed text from the model. Returns false when the reply must stop. */
  async content(text: string, chunk?: ChatCompletionChunk): Promise<boolean> {
    if (this.stopped) return false;
    if (chunk) this.meta = chunk;
    if (!this.check) {
      this.release(text, chunk);
      return true;
    }
    for (const sentence of this.splitter.push(text)) {
      if (!(await this.checkAndRelease(sentence))) return false;
    }
    return true;
  }

  /** End of a model round: check and release the unterminated tail; returns the round's history message, if it said anything. */
  async endSegment(): Promise<AssistantMessage | undefined> {
    const rest = this.splitter.flush();
    if (rest.trim() && !this.stopped) await this.checkAndRelease(rest);
    const msg = this.segmentMsg;
    this.segmentMsg = undefined;
    return msg;
  }

  /** Speak fixed text (a scripted reply), as one segment. */
  async write(text: string): Promise<void> {
    await this.content(text);
    await this.endSegment();
  }

  recordChecks(rec: TurnRecorder) {
    if (!this.checks.count) return;
    const result = this.stopped ? 'fail' : this.checks.replaced ? 'replaced' : 'pass';
    rec.step('output_check', Math.round(this.checks.ms), result, { sentences: this.checks.count });
  }

  private async checkAndRelease(sentence: string): Promise<boolean> {
    if (this.signal?.aborted) return false;
    const t = now();
    const verdict = await this.check!(sentence.trim(), this.call.ctx);
    this.checks.ms += now() - t;
    this.checks.count++;
    if (this.signal?.aborted) return false;
    if (verdict === false) {
      this.stopped = true;
      this.call.log.info({ turn_id: this.turnId, reply_id: this.replyId }, 'checkSentence stopped the reply');
      return false;
    }
    let out = sentence;
    if (typeof verdict === 'string') {
      this.checks.replaced++;
      out = verdict + (sentence.match(/\s*$/)?.[0] ?? '');
    }
    this.release(out);
    return true;
  }

  private release(text: string, original?: ChatCompletionChunk) {
    if (!text || this.signal?.aborted) return;
    const chunk: ChatCompletionChunk = original ?? {
      id: this.meta?.id ?? this.replyId,
      object: 'chat.completion.chunk',
      created: this.meta?.created ?? Math.floor(Date.now() / 1000),
      model: this.meta?.model ?? 'harness',
      choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
    };
    this.call.send({
      type: 'reply:chunk',
      reply_id: this.replyId,
      ...(this.turnId !== undefined ? { turn_id: this.turnId } : {}),
      ...(!this.started ? stripUndefined(this.first) : {}),
      chunk,
    });
    this.started = true;
    this.text += text;
    // history holds what was sent to TTS, as it is sent, so a barge-in can trim it to what was heard
    if (!this.segmentMsg) {
      this.segmentMsg = { role: 'assistant', content: '' };
      this.call.addAssistant(this.replyId, this.segmentMsg);
    }
    this.segmentMsg.content += text;
  }
}

type AssistantMessage = Extract<ChatMessage, { role: 'assistant' }> & { content: string };

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function errMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

export class HarnessCall {
  readonly callSid: string;
  readonly log: Logger;
  readonly ctx: HarnessContext;
  readonly history: ChatMessage[] = [];
  readonly state = new Map<string, unknown>();
  ended = false;

  private ws?: WebSocket;
  private current?: TurnRun;
  private seq = 0;
  private silenceStreak = 0;
  private pendingRecord: Record<string, unknown> = {};
  private activeRecorder?: TurnRecorder;
  private replies = new Map<string, ChatMessage[]>();
  private commands = new Map<string, (r: CommandResult) => void>();
  private toolCalls = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private spokenWaiters = new Map<string, () => void>();

  constructor(
    readonly session: SessionStartMessage,
    private opts: HarnessOptions,
    private model: ModelClient,
    baseLogger: Logger,
  ) {
    this.callSid = session.call_sid;
    this.log = baseLogger.child({ call_sid: this.callSid });
    const call = this;
    this.ctx = {
      callSid: this.callSid,
      session,
      state: this.state,
      history: this.history,
      log: this.log,
      say: (text: string, o?: SayOptions) => call.say(text, o),
      command: (name: string, args?: Record<string, unknown>) => call.command(name, args),
      callTool: (name: string, args?: Record<string, unknown>) => call.callTool(name, args ?? {}),
      record: (field: string, value: unknown) => {
        if (call.activeRecorder) call.activeRecorder.record[field] = value;
        else call.pendingRecord[field] = value;
      },
    } as HarnessContext;
  }

  attach(ws: WebSocket) {
    this.ws = ws;
  }

  /** The socket dropped without `session:end`: stop the turn in flight; state is kept for a resume. */
  detach() {
    this.ws = undefined;
    this.abortTurn('socket_closed');
  }

  send(msg: HarnessToJambonzMessage) {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1 /* OPEN */) {
      this.log.warn({ type: msg.type }, 'harness socket not open; message dropped');
      return;
    }
    ws.send(JSON.stringify(msg));
  }

  async start() {
    if (this.opts.onSessionStart) await this.opts.onSessionStart(this.session, this.ctx);
  }

  handle(msg: JambonzToHarnessMessage) {
    switch (msg.type) {
      case 'turn:start':
        void this.runTurn(msg);
        break;
      case 'turn:cancel':
        if (this.current?.turnId === msg.turn_id) {
          this.log.debug({ turn_id: msg.turn_id, reason: msg.reason }, 'turn cancelled');
          this.abortTurn(msg.reason);
        }
        break;
      case 'event':
        void this.handleEvent(msg as unknown as { name: string; [k: string]: unknown });
        break;
      case 'command:result': {
        const resolve = this.commands.get(msg.command_id);
        if (!resolve) {
          this.log.warn({ command_id: msg.command_id }, 'command:result for an unknown command');
          break;
        }
        this.commands.delete(msg.command_id);
        const { type: _t, call_sid: _c, command_id: _id, ...result } = msg;
        if (!msg.ok) this.log.warn({ command_id: msg.command_id, error: msg.error }, 'command failed');
        resolve(result as CommandResult);
        break;
      }
      case 'tool:result': {
        const pending = this.toolCalls.get(msg.call_id);
        if (!pending) {
          this.log.warn({ call_id: msg.call_id }, 'tool:result for an unknown tool call');
          break;
        }
        this.toolCalls.delete(msg.call_id);
        if (msg.error !== undefined) pending.reject(new Error(msg.error));
        else pending.resolve(msg.result);
        break;
      }
      case 'session:end':
        void this.end(msg);
        break;
      default:
        // speech:start, transcript (A.10, unused by the skeleton) and anything new: ignored
        break;
    }
  }

  async end(msg: SessionEndMessage) {
    if (this.ended) return;
    this.ended = true;
    this.log.info({ reason: msg.reason, duration_ms: msg.duration_ms }, 'session ended');
    this.abortTurn('session_end');
    for (const resolve of this.commands.values()) resolve({ ok: false, error: 'session_ended' });
    this.commands.clear();
    for (const p of this.toolCalls.values()) p.reject(new Error('session_ended'));
    this.toolCalls.clear();
    for (const done of this.spokenWaiters.values()) done();
    this.spokenWaiters.clear();
    try {
      if (this.opts.onSessionEnd) await this.opts.onSessionEnd(msg, this.ctx);
    } catch (err) {
      this.log.error({ err }, 'onSessionEnd hook threw');
    }
  }

  /* ---------------- ctx operations ---------------- */

  say(text: string, o: SayOptions = {}): string {
    const replyId = `u${++this.seq}`;
    const writer = new ReplyWriter(this, replyId, undefined, undefined, { interrupt: o.interrupt, interruptible: o.interruptible }, undefined);
    void writer.write(text); // no check: released synchronously
    this.send({ type: 'reply:done', reply_id: replyId });
    return replyId;
  }

  command(name: string, args: Record<string, unknown> = {}): Promise<CommandResult> {
    const commandId = `c${++this.seq}`;
    if (this.ended) return Promise.resolve({ ok: false, error: 'session_ended' });
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.commands.delete(commandId)) {
          this.log.warn({ command_id: commandId, name }, 'no command:result within timeout');
          resolve({ ok: false, error: 'timeout' });
        }
      }, COMMAND_TIMEOUT_MS);
      this.commands.set(commandId, (r) => {
        clearTimeout(timer);
        resolve(r);
      });
      this.log.info({ command_id: commandId, name }, 'sending command');
      this.send({ type: 'command', command_id: commandId, name, args });
    });
  }

  callTool(name: string, args: Record<string, unknown>, turnId?: number): Promise<unknown> {
    const callId = `t${++this.seq}`;
    if (this.ended) return Promise.reject(new Error('session_ended'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.toolCalls.delete(callId)) reject(new Error('timeout waiting for tool:result'));
      }, TOOL_TIMEOUT_MS);
      this.toolCalls.set(callId, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      this.send({ type: 'tool:call', call_id: callId, ...(turnId !== undefined ? { turn_id: turnId } : {}), name, args });
    });
  }

  /* ---------------- events ---------------- */

  private async handleEvent(e: { name: string; [k: string]: unknown }) {
    if (e.name === 'user_interruption') this.trimToSpoken(e as unknown as UserInterruptionEvent);
    if (e.name === 'reply_spoken' || e.name === 'reply_dropped') {
      const id = e.reply_id as string;
      this.spokenWaiters.get(id)?.();
      this.spokenWaiters.delete(id);
    }
    if (e.name === 'error') this.log.warn({ event: e }, 'jambonz refused a message from the harness');

    const handler = (this.opts.onEvent as Record<string, ((ev: unknown, ctx: HarnessContext) => unknown) | undefined> | undefined)?.[e.name];
    try {
      if (handler) await handler(e, this.ctx);
      else if (e.name === 'silence') await this.defaultSilence((e as unknown as SilenceEvent).streak ?? 1);
    } catch (err) {
      this.log.error({ err, event: e.name }, 'onEvent handler threw');
    }
  }

  /** Keep only what the caller heard of an interrupted reply. */
  private trimToSpoken(e: UserInterruptionEvent) {
    const msgs = this.replies.get(e.reply_id);
    if (!msgs) return;
    let rest = e.spoken ?? '';
    for (const m of msgs) {
      if (m.role !== 'assistant' || !m.content) continue;
      const take = rest.slice(0, m.content.length);
      rest = rest.slice(m.content.length);
      m.content = take;
    }
    for (const m of msgs) {
      if (m.role === 'assistant' && !m.content && !m.tool_calls?.length) {
        const i = this.history.indexOf(m);
        if (i >= 0) this.history.splice(i, 1);
      }
    }
    this.log.debug({ reply_id: e.reply_id, spoken: e.spoken?.length }, 'history trimmed to what the caller heard');
  }

  private async defaultSilence(streak: number) {
    if (streak < 2) {
      this.say(SILENCE_REPROMPT);
    } else {
      const replyId = this.say(SILENCE_GOODBYE);
      await this.hangupAfterSpoken(replyId);
    }
  }

  private async hangupAfterSpoken(replyId: string) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, SPOKEN_WAIT_MS);
      this.spokenWaiters.set(replyId, () => { clearTimeout(timer); resolve(); });
    });
    if (!this.ended) await this.command('hangup', { reason: 'no_input' });
  }

  addAssistant(replyId: string, msg: ChatMessage) {
    this.history.push(msg);
    const list = this.replies.get(replyId);
    if (list) list.push(msg);
    else {
      this.replies.set(replyId, [msg]);
      if (this.replies.size > MAX_TRACKED_REPLIES) this.replies.delete(this.replies.keys().next().value!);
    }
  }

  private abortTurn(reason: string) {
    if (!this.current) return;
    this.current.controller.abort(reason);
    this.current = undefined;
  }

  /* ---------------- turns ---------------- */

  private async runTurn(msg: TurnStartMessage) {
    // a new turn supersedes one still running
    this.abortTurn('superseded');
    const run: TurnRun = { turnId: msg.turn_id, controller: new AbortController() };
    this.current = run;
    const { signal } = run.controller;
    const input = msg.input ?? { type: 'speech', text: '' };
    const turn: HarnessTurn = { turnId: msg.turn_id, input, text: input.type === 'speech' ? input.text ?? '' : '' };
    const rec = new TurnRecorder();
    Object.assign(rec.record, this.pendingRecord);
    this.pendingRecord = {};
    this.activeRecorder = rec;
    const replyId = `r${msg.turn_id}`;
    const first: { interruptible?: boolean } = {};
    const writer = new ReplyWriter(this, replyId, msg.turn_id, signal, first, this.opts.checkSentence);
    let hangupAfter = false;

    try {
      if (input.type === 'no_input') {
        hangupAfter = await this.noInputTurn(turn, writer);
      } else {
        if (input.type === 'speech') {
          this.history.push({ role: 'user', content: turn.text });
          this.silenceStreak = 0;
        }
        let plan: BeforeModelResult = {};
        if (this.opts.beforeModel) {
          const t = now();
          plan = (await this.opts.beforeModel(turn, this.ctx)) ?? {};
          rec.step('beforeModel', ms(t));
          if (signal.aborted) return;
        }
        if (plan.route) rec.record.route = plan.route;
        if (plan.interruptible === false) first.interruptible = false;
        const scripted = plan.reply ?? (input.type === 'greeting' && !plan.messages ? this.opts.greeting : undefined);
        if (scripted !== undefined) {
          await writer.write(scripted);
        } else {
          await this.modelLoop(turn, plan, writer, rec, signal);
        }
      }
    } catch (err) {
      if (signal.aborted) return;
      this.log.error({ err, turn_id: msg.turn_id }, 'turn failed');
      rec.record.error = errMessage(err);
      if (!writer.started) {
        await writer.write(this.opts.errorReply ?? DEFAULT_ERROR_REPLY).catch(() => undefined);
      }
    } finally {
      if (this.activeRecorder === rec) this.activeRecorder = undefined;
    }
    if (signal.aborted) return;

    writer.recordChecks(rec);
    if (this.opts.afterTurn) {
      this.activeRecorder = rec;
      try {
        await this.opts.afterTurn({ ...turn, reply: writer.text, record: rec.record }, this.ctx);
      } catch (err) {
        this.log.error({ err, turn_id: msg.turn_id }, 'afterTurn hook threw');
      } finally {
        this.activeRecorder = undefined;
      }
      if (signal.aborted) return;
    }
    if (this.current === run) this.current = undefined;

    let record: TurnRecord = rec.record;
    const size = Buffer.byteLength(JSON.stringify(record));
    if (size > MAX_TURN_RECORD_BYTES) {
      this.log.warn({ turn_id: msg.turn_id, bytes: size }, 'turn_record over 16 KB; sending a truncated record');
      record = { route: record.route, note: `turn_record truncated (${size} bytes)` };
    }
    let spoken: Promise<void> | undefined;
    if (hangupAfter) spoken = this.hangupAfterSpoken(replyId);
    this.send({ type: 'reply:done', reply_id: replyId, turn_id: msg.turn_id, turn_record: record });
    await spoken;
  }

  /** A `no_input` turn: `onEvent.silence` if set, else reprompt once and hang up on the next. Returns true to hang up. */
  private async noInputTurn(turn: HarnessTurn, writer: ReplyWriter): Promise<boolean> {
    const streak = ++this.silenceStreak;
    const handler = this.opts.onEvent?.silence;
    if (handler) {
      await handler({ name: 'silence', streak, turn_id: turn.turnId }, this.ctx);
      return false;
    }
    const text = streak < 2 ? SILENCE_REPROMPT : SILENCE_GOODBYE;
    await writer.write(text);
    return streak >= 2;
  }

  private toolsFor(plan: BeforeModelResult): ChatTool[] {
    const own: ChatTool[] = Object.entries(this.opts.tools ?? {}).map(([name, t]) => ({
      type: 'function',
      function: { name, description: t.description, parameters: t.parameters ?? { type: 'object', properties: {} } },
    }));
    const ownNames = new Set(own.map((t) => t.function.name));
    const all = [...own, ...(this.session.tools ?? []).filter((t) => !ownNames.has(t.function?.name))];
    if (!plan.tools) return all;
    const wanted = new Set(plan.tools);
    return all.filter((t) => wanted.has(t.function.name));
  }

  private async modelLoop(turn: HarnessTurn, plan: BeforeModelResult, writer: ReplyWriter, rec: TurnRecorder, signal: AbortSignal) {
    const model = plan.model ?? this.opts.model ?? 'gpt-4.1-mini';
    const instructions = plan.instructions ?? this.opts.instructions;
    const tools = this.toolsFor(plan);
    const base: ChatMessage[] = plan.messages
      ? [...plan.messages]
      : [
          ...(instructions ? [{ role: 'system' as const, content: instructions }] : []),
          ...this.history,
          ...(turn.input.type === 'greeting' ? [{ role: 'user' as const, content: GREETING_PROMPT }] : []),
        ];
    const added: ChatMessage[] = [];
    const maxRounds = this.opts.maxToolRounds ?? 5;

    for (let round = 0; ; round++) {
      const t0 = now();
      let firstTokenMs: number | undefined;
      let usage: ChatCompletionChunk['usage'];
      const calls: Array<{ id: string; name: string; arguments: string }> = [];
      let stopped = false;
      const offer = round < maxRounds ? tools : [];

      for await (const chunk of this.model.stream({
        model,
        messages: [...base, ...added],
        tools: offer,
        params: this.opts.modelParams,
        signal,
      })) {
        if (chunk.usage) usage = chunk.usage;
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;
        if (delta.content) {
          firstTokenMs ??= ms(t0);
          if (!(await writer.content(delta.content, chunk))) {
            stopped = true;
            break;
          }
        }
        for (const tc of delta.tool_calls ?? []) {
          const slot = (calls[tc.index] ??= { id: '', name: '', arguments: '' });
          if (tc.id) slot.id = tc.id;
          if (tc.function?.name) slot.name += tc.function.name;
          if (tc.function?.arguments) slot.arguments += tc.function.arguments;
        }
      }
      if (signal.aborted) return;
      const took = ms(t0);
      rec.step('model', took);
      rec.modelCall({
        model,
        purpose: 'reply',
        ...(usage?.prompt_tokens !== undefined ? { input_tokens: usage.prompt_tokens } : {}),
        ...(usage?.completion_tokens !== undefined ? { output_tokens: usage.completion_tokens } : {}),
        ...(firstTokenMs !== undefined ? { first_token_ms: firstTokenMs } : {}),
        ms: took,
      });

      const said = await writer.endSegment();
      if (signal.aborted) return;
      const toolCalls: ChatToolCall[] = stopped || writer.stopped
        ? []
        : calls.filter(Boolean).map((c, i) => ({
            id: c.id || `call_${turn.turnId}_${round}_${i}`,
            type: 'function',
            function: { name: c.name, arguments: c.arguments },
          }));

      if (!toolCalls.length) return;

      // the round's spoken text (already in history) carries the tool calls
      let assistant: ChatMessage;
      if (said) {
        assistant = Object.assign(said, { tool_calls: toolCalls });
      } else {
        assistant = { role: 'assistant', content: null, tool_calls: toolCalls };
        this.addAssistant(writer.replyId, assistant);
      }
      added.push(assistant);
      // if the turn is cancelled while tools run, answer each call at once so the history stays valid for the next turn
      const onAbort = () => {
        for (const tc of toolCalls) this.history.push({ role: 'tool', tool_call_id: tc.id, content: '{"error":"cancelled"}' });
      };
      signal.addEventListener('abort', onAbort, { once: true });
      const results = await Promise.all(toolCalls.map((tc) => this.runTool(tc, turn.turnId, rec)));
      signal.removeEventListener('abort', onAbort);
      if (signal.aborted) return;
      for (const r of results) {
        added.push(r);
        this.history.push(r);
      }
    }
  }

  private async runTool(tc: ChatToolCall, turnId: number, rec: TurnRecorder): Promise<ChatMessage> {
    const name = tc.function.name;
    const t = now();
    let content: string;
    let ok = true;
    let args: Record<string, unknown> = {};
    try {
      args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
    } catch {
      ok = false;
    }
    const own = this.opts.tools?.[name];
    const studio = this.session.tools?.some((x) => x.function?.name === name);
    try {
      if (!ok) throw new Error(`invalid JSON arguments for ${name}`);
      let result: unknown;
      if (own) result = await own.run(args, this.ctx);
      else if (studio) result = await this.callTool(name, args, turnId);
      else throw new Error(`unknown tool ${name}`);
      content = typeof result === 'string' ? result : JSON.stringify(result ?? null);
    } catch (err) {
      ok = false;
      this.log.warn({ err, tool: name, turn_id: turnId }, 'tool failed');
      content = JSON.stringify({ error: errMessage(err) });
    }
    const took = ms(t);
    rec.step(`tool:${name}`, took, ok ? 'ok' : 'error');
    if (own) rec.ownTool(name, ok, took);
    return { role: 'tool', tool_call_id: tc.id, content };
  }
}
