/**
 * WebSocket Session — represents a single call over a persistent WebSocket connection.
 * Provides verb building (via VerbBuilder composition), send/reply, TTS streaming,
 * inject commands, and LLM tool output.
 */

import { EventEmitter } from 'events';
import type { WebSocket } from 'ws';
import type { Logger } from '../types/common.js';
import type { CallSession, WsMessage, WsResponse } from '../types/session.js';
import type { Verb } from '../types/verbs.js';
import { VerbBuilder, type VerbBuilderOptions } from '../verb-builder.js';

interface QueueEntry {
  type: 'tokens' | 'flush';
  id: number;
  tokens?: string;
  resolve: () => void;
  reject: (reason?: unknown) => void;
}

export interface SessionOptions extends VerbBuilderOptions {
  ws: WebSocket;
  msg: WsMessage;
  logger: Logger;
}

export class Session extends EventEmitter {
  readonly callSid: string;
  readonly b3: string | undefined;
  readonly data: CallSession;
  /** Application-specific storage that persists for the session. */
  locals: Record<string, unknown> = {};

  private ws: WebSocket;
  private logger: Logger;
  private msgid: string;
  private acked = false;
  private builder: VerbBuilder;
  private commandQueue: QueueEntry[] = [];
  private ttsCounter = 0;
  private ttsPaused = false;

  constructor(opts: SessionOptions) {
    super();

    this.ws = opts.ws;
    this.logger = opts.logger;
    this.msgid = opts.msg.msgid;
    this.callSid = opts.msg.data?.call_sid as string ?? opts.msg.call_sid ?? '';
    this.b3 = opts.msg.b3;
    this.data = (opts.msg.data ?? {}) as CallSession;

    this.builder = new VerbBuilder({
      validate: opts.validate,
      schemaDir: opts.schemaDir,
    });

    // Take over message handling from the client
    this.ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
      this.onMessage(data);
    });

    this.ws.on('close', (code: number, reason: Buffer) => {
      this.emit('close', code, reason);
    });

    this.ws.on('error', (err: Error) => {
      this.emit('error', err);
    });
  }

  // ---------------------------------------------------------------------------
  // Verb builder delegation — same API as VerbBuilder
  // ---------------------------------------------------------------------------

  say(opts: Parameters<VerbBuilder['say']>[0]): this { this.builder.say(opts); return this; }
  play(opts: Parameters<VerbBuilder['play']>[0]): this { this.builder.play(opts); return this; }
  gather(opts: Parameters<VerbBuilder['gather']>[0]): this { this.builder.gather(opts); return this; }
  llm(opts: Parameters<VerbBuilder['llm']>[0]): this { this.builder.llm(opts); return this; }
  pipeline(opts: Parameters<VerbBuilder['pipeline']>[0]): this { this.builder.pipeline(opts); return this; }
  listen(opts: Parameters<VerbBuilder['listen']>[0]): this { this.builder.listen(opts); return this; }
  stream(opts: Parameters<VerbBuilder['stream']>[0]): this { this.builder.stream(opts); return this; }
  transcribe(opts: Parameters<VerbBuilder['transcribe']>[0]): this { this.builder.transcribe(opts); return this; }
  dial(opts: Parameters<VerbBuilder['dial']>[0]): this { this.builder.dial(opts); return this; }
  conference(opts: Parameters<VerbBuilder['conference']>[0]): this { this.builder.conference(opts); return this; }
  enqueue(opts: Parameters<VerbBuilder['enqueue']>[0]): this { this.builder.enqueue(opts); return this; }
  dequeue(opts: Parameters<VerbBuilder['dequeue']>[0]): this { this.builder.dequeue(opts); return this; }
  hangup(opts?: Parameters<VerbBuilder['hangup']>[0]): this { this.builder.hangup(opts); return this; }
  redirect(opts: Parameters<VerbBuilder['redirect']>[0]): this { this.builder.redirect(opts); return this; }
  pause(opts: Parameters<VerbBuilder['pause']>[0]): this { this.builder.pause(opts); return this; }
  leave(opts?: Parameters<VerbBuilder['leave']>[0]): this { this.builder.leave(opts); return this; }
  sipDecline(opts: Parameters<VerbBuilder['sipDecline']>[0]): this { this.builder.sipDecline(opts); return this; }
  sipRequest(opts: Parameters<VerbBuilder['sipRequest']>[0]): this { this.builder.sipRequest(opts); return this; }
  sipRefer(opts: Parameters<VerbBuilder['sipRefer']>[0]): this { this.builder.sipRefer(opts); return this; }
  config(opts: Parameters<VerbBuilder['config']>[0]): this { this.builder.config(opts); return this; }
  answer(opts?: Parameters<VerbBuilder['answer']>[0]): this { this.builder.answer(opts); return this; }
  alert(opts: Parameters<VerbBuilder['alert']>[0]): this { this.builder.alert(opts); return this; }
  tag(opts: Parameters<VerbBuilder['tag']>[0]): this { this.builder.tag(opts); return this; }
  dtmf(opts: Parameters<VerbBuilder['dtmf']>[0]): this { this.builder.dtmf(opts); return this; }
  dub(opts: Parameters<VerbBuilder['dub']>[0]): this { this.builder.dub(opts); return this; }
  message(opts: Parameters<VerbBuilder['message']>[0]): this { this.builder.message(opts); return this; }

  /** Add raw JSON verbs (primary AI agent path). */
  addVerbs(verbs: Verb[]): this {
    this.builder.addVerbs(verbs);
    return this;
  }

  // ---------------------------------------------------------------------------
  // Send / Reply
  // ---------------------------------------------------------------------------

  /** Send queued verbs to jambonz. */
  send(opts?: { execImmediate?: boolean }): void {
    const execImmediate = opts?.execImmediate ?? true;
    const data = this.builder.toJSON();
    this.builder.clear();

    if (!this.acked) {
      // First send — acknowledge the session:new message
      this.acked = true;
      const response: WsResponse = {
        type: 'ack',
        msgid: this.msgid,
        data,
      };
      this.wsSend(response);
    } else {
      const response: WsResponse = {
        type: 'command',
        command: 'redirect',
        queueCommand: !execImmediate,
        data,
      };
      this.wsSend(response);
    }
  }

  /** Reply to an actionHook/eventHook with queued verbs. */
  reply(opts?: { execImmediate?: boolean }): void {
    const execImmediate = opts?.execImmediate ?? true;
    const data = this.builder.toJSON();
    this.builder.clear();

    const response: WsResponse = {
      type: 'ack',
      msgid: this.msgid,
      data,
    };

    if (!execImmediate) {
      response.type = 'command';
      response.command = 'redirect';
      response.queueCommand = true;
    }

    this.wsSend(response);
  }

  // ---------------------------------------------------------------------------
  // Inject commands (immediate execution, bypass verb queue)
  // ---------------------------------------------------------------------------

  /** Send an inject command for immediate execution. */
  injectCommand(command: string, data?: unknown, callSid?: string): void {
    this.wsSend({
      type: 'command',
      command: 'inject',
      data: {
        command,
        ...(typeof data === 'object' && data !== null ? data : {}),
        ...(callSid ? { call_sid: callSid } : {}),
      },
    });
  }

  /** Redirect call execution to a new webhook. */
  injectRedirect(hook: string | { url: string; [key: string]: unknown }, callSid?: string): void {
    this.injectCommand('redirect', { call_hook: hook }, callSid);
  }

  /** Inject a whisper verb (say/play) to one party on the call. */
  injectWhisper(verb: Verb | Verb[], callSid?: string): void {
    this.injectCommand('whisper', Array.isArray(verb) ? verb : [verb], callSid);
  }

  /** Mute or unmute the call. */
  injectMute(status: 'mute' | 'unmute', callSid?: string): void {
    this.injectCommand('mute:status', { mute_status: status }, callSid);
  }

  /** Pause or resume audio streaming (listen/stream). */
  injectListenStatus(status: 'pause' | 'resume', callSid?: string): void {
    this.injectCommand('listen:status', { listen_status: status }, callSid);
  }

  /** Control call recording. */
  injectRecord(action: 'startCallRecording' | 'stopCallRecording' | 'pauseCallRecording' | 'resumeCallRecording', opts?: Record<string, unknown>, callSid?: string): void {
    this.injectCommand('record', { action, ...opts }, callSid);
  }

  /** Send DTMF digits into the call. */
  injectDtmf(digit: string, duration?: number, callSid?: string): void {
    this.injectCommand('dtmf', { digit, ...(duration !== undefined ? { duration } : {}) }, callSid);
  }

  /** Attach metadata to the call. */
  injectTag(data: Record<string, unknown>, callSid?: string): void {
    this.injectCommand('tag', data, callSid);
  }

  /** Send a generic command. */
  sendCommand(command: string, data?: unknown): void {
    this.wsSend({
      type: 'command',
      command,
      data,
    });
  }

  /** Send tool output to an active LLM conversation. */
  sendToolOutput(toolCallId: string, data: unknown): void {
    this.wsSend({
      type: 'command',
      command: 'llm:tool-result',
      data: { tool_call_id: toolCallId, ...((typeof data === 'object' && data !== null ? data : { result: data })) },
    });
  }

  /** Update an active LLM conversation. */
  updateLlm(data: unknown): void {
    this.wsSend({
      type: 'command',
      command: 'llm:update',
      data,
    });
  }

  // ---------------------------------------------------------------------------
  // TTS Token Streaming
  // ---------------------------------------------------------------------------

  /** Whether TTS streaming is paused due to backpressure. */
  get isTtsPaused(): boolean {
    return this.ttsPaused;
  }

  /**
   * Send a streaming TTS token.
   * Returns a promise that resolves when jambonz acknowledges receipt.
   * Backpressure is applied automatically: if jambonz signals 'full',
   * subsequent tokens queue until a 'stream_resumed' event arrives.
   */
  sendTtsTokens(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = ++this.ttsCounter;
      this.commandQueue.push({ type: 'tokens', id, tokens: text, resolve, reject });

      if (this.commandQueue.length === 1 && !this.ttsPaused) {
        this.processQueue();
      }
    });
  }

  /** Queue a TTS flush command. Sent immediately if the queue is empty. */
  flushTtsTokens(): void {
    if (this.commandQueue.length === 0) {
      this.sendCommand('tts:flush');
    } else {
      this.commandQueue.push({
        type: 'flush',
        id: ++this.ttsCounter,
        resolve: () => {},
        reject: () => {},
      });
    }
  }

  /** Clear all pending TTS tokens and send tts:clear. */
  clearTtsTokens(): void {
    for (const entry of this.commandQueue) {
      if (entry.type === 'tokens') {
        entry.resolve();
      }
    }
    this.commandQueue = [];
    this.ttsPaused = false;
    this.sendCommand('tts:clear');
  }

  private processQueue(): void {
    // Process any flush commands at the head of the queue
    while (this.commandQueue.length > 0 && this.commandQueue[0].type === 'flush') {
      const entry = this.commandQueue.shift()!;
      this.sendCommand('tts:flush');
      entry.resolve();
    }

    // Send the next token (one at a time — wait for ack before sending more)
    if (this.commandQueue.length > 0 && !this.ttsPaused) {
      const entry = this.commandQueue[0];
      this.wsSend({
        type: 'command',
        command: 'tts:tokens',
        data: { id: entry.id, tokens: entry.tokens },
      });
      // Don't shift — entry stays at head until handleTtsTokensResult resolves it
    }
  }

  private handleTtsTokensResult(data: Record<string, unknown>): void {
    if (this.commandQueue.length === 0) return;

    const entry = this.commandQueue[0];
    if (entry.type !== 'tokens') return;

    const { status, reason } = data as { id?: number; status?: string; reason?: string };

    if (status === 'ok') {
      this.commandQueue.shift();
      entry.resolve();
    } else if (reason === 'full') {
      this.ttsPaused = true;
      // Don't shift — the token wasn't consumed, it will be re-sent on resume
      entry.resolve();
    } else {
      this.commandQueue.shift();
      entry.reject(new Error(`tts-token error: ${reason}`));
    }

    if (this.commandQueue.length > 0 && !this.ttsPaused) {
      this.processQueue();
    }
  }

  private handleUserInterruption(): void {
    for (const entry of this.commandQueue) {
      if (entry.type === 'tokens') {
        entry.resolve();
      }
    }
    this.commandQueue = [];
    this.ttsPaused = false;
    this.emit('tts:user_interrupt');
  }

  private resumeTtsStreaming(): void {
    this.ttsPaused = false;
    this.processQueue();
  }

  // ---------------------------------------------------------------------------
  // Inbound message handling
  // ---------------------------------------------------------------------------

  private onMessage(raw: Buffer | ArrayBuffer | Buffer[]): void {
    try {
      const str = typeof raw === 'string' ? raw : Buffer.from(raw as Buffer).toString('utf-8');
      const msg = JSON.parse(str) as WsMessage;
      const { type, msgid, data, hook } = msg;

      switch (type) {
        case 'verb:hook':
        case 'session:redirect':
        case 'dial:confirm':
          this.msgid = msgid;
          if (hook && this.listenerCount(hook) > 0) {
            this.emit(hook, data);
          } else if (type === 'verb:hook' && this.listenerCount('verb:hook') > 0) {
            this.emit('verb:hook', hook, data);
          } else {
            // Auto-reply with empty verb array if no listener
            this.reply();
          }
          break;

        case 'llm:event':
        case 'llm:tool-call':
          if (hook) {
            this.emit(hook, data);
          }
          this.emit(type, data);
          break;

        case 'tts:streaming-event':
          if (data?.event_type === 'stream_resumed') {
            this.resumeTtsStreaming();
          } else if (data?.event_type === 'user_interruption') {
            this.handleUserInterruption();
          }
          this.emit('tts:streaming-event', data);
          break;

        case 'tts:tokens-result':
          this.handleTtsTokensResult(data ?? {});
          break;

        case 'call:status':
        case 'verb:status':
        case 'jambonz:error':
          this.emit(type, data);
          break;

        default:
          this.logger.debug({ type }, 'Session: unhandled message type');
      }
    } catch (err) {
      this.logger.info({ err }, 'Session: error handling message');
    }
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  private wsSend(msg: WsResponse | Record<string, unknown>): void {
    if (this.ws.readyState === 1 /* WebSocket.OPEN */) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /** Close the WebSocket connection. */
  close(): void {
    this.ws.close();
  }

  toJSON(): CallSession {
    return this.data;
  }
}
