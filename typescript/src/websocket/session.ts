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

/**
 * Represents a single call over a persistent WebSocket connection.
 *
 * Provides verb building (chainable methods), send/reply for verb delivery,
 * TTS token streaming with backpressure, inject commands for mid-call control,
 * and LLM tool output. Emits events for actionHooks, call status, and TTS lifecycle.
 *
 * Created automatically by the SDK when a new call arrives — you receive it
 * via the `session:new` event on a {@link WsClient}.
 */
export class Session extends EventEmitter {
  /** Unique call identifier. */
  readonly callSid: string;
  /** Caller phone number or SIP URI. */
  readonly from: string;
  /** Called phone number or SIP URI. */
  readonly to: string;
  /** Call direction. */
  readonly direction: 'inbound' | 'outbound';
  /** Account identifier. */
  readonly accountSid: string;
  /** Application identifier. */
  readonly applicationSid: string;
  /** SIP Call-ID. */
  readonly callId: string;
  /** Distributed trace header (B3 format), if present. */
  readonly b3: string | undefined;
  /** Full call session data from jambonz (includes env_vars, SIP headers, etc.). */
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

  /** @internal */
  constructor(opts: SessionOptions) {
    super();

    this.ws = opts.ws;
    this.logger = opts.logger;
    this.msgid = opts.msg.msgid;
    this.data = (opts.msg.data ?? {}) as CallSession;
    this.callSid = this.data.call_sid ?? opts.msg.call_sid ?? '';
    this.from = this.data.from ?? '';
    this.to = this.data.to ?? '';
    this.direction = this.data.direction ?? 'inbound';
    this.accountSid = this.data.account_sid ?? '';
    this.applicationSid = this.data.application_sid ?? '';
    this.callId = this.data.call_id ?? '';
    this.b3 = opts.msg.b3;

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

  /** Speak text using TTS. Supports SSML, multiple voices, and streaming. */
  say(opts: Parameters<VerbBuilder['say']>[0]): this { this.builder.say(opts); return this; }
  /** Play an audio file from a URL. */
  play(opts: Parameters<VerbBuilder['play']>[0]): this { this.builder.play(opts); return this; }
  /** Collect speech (STT) and/or DTMF input from the caller. */
  gather(opts: Parameters<VerbBuilder['gather']>[0]): this { this.builder.gather(opts); return this; }
  /** Connect the caller to an LLM for real-time voice conversation (deprecated — use vendor shortcuts). */
  llm(opts: Parameters<VerbBuilder['llm']>[0]): this { this.builder.llm(opts); return this; }
  /** Connect the caller to a speech-to-speech LLM. */
  s2s(opts: Parameters<VerbBuilder['s2s']>[0]): this { this.builder.s2s(opts); return this; }
  /** Shortcut for s2s with vendor='openai'. */
  openai_s2s(opts: Parameters<VerbBuilder['openai_s2s']>[0]): this { this.builder.openai_s2s(opts); return this; }
  /** Shortcut for s2s with vendor='google'. */
  google_s2s(opts: Parameters<VerbBuilder['google_s2s']>[0]): this { this.builder.google_s2s(opts); return this; }
  /** Shortcut for s2s with vendor='elevenlabs'. */
  elevenlabs_s2s(opts: Parameters<VerbBuilder['elevenlabs_s2s']>[0]): this { this.builder.elevenlabs_s2s(opts); return this; }
  /** Shortcut for s2s with vendor='deepgram'. */
  deepgram_s2s(opts: Parameters<VerbBuilder['deepgram_s2s']>[0]): this { this.builder.deepgram_s2s(opts); return this; }
  /** Shortcut for s2s with vendor='ultravox'. */
  ultravox_s2s(opts: Parameters<VerbBuilder['ultravox_s2s']>[0]): this { this.builder.ultravox_s2s(opts); return this; }
  /** Connect the caller to a Google Dialogflow agent. */
  dialogflow(opts: Parameters<VerbBuilder['dialogflow']>[0]): this { this.builder.dialogflow(opts); return this; }
  /** Voice AI pipeline with integrated turn detection. */
  pipeline(opts: Parameters<VerbBuilder['pipeline']>[0]): this { this.builder.pipeline(opts); return this; }
  /** Stream real-time call audio to a WebSocket endpoint. Supports bidirectional audio. */
  listen(opts: Parameters<VerbBuilder['listen']>[0]): this { this.builder.listen(opts); return this; }
  /** Stream real-time call audio to a WebSocket endpoint. Synonym for {@link listen}. */
  stream(opts: Parameters<VerbBuilder['stream']>[0]): this { this.builder.stream(opts); return this; }
  /** Real-time call transcription sent to a webhook. */
  transcribe(opts: Parameters<VerbBuilder['transcribe']>[0]): this { this.builder.transcribe(opts); return this; }
  /** Place an outbound call and bridge it to the current caller. */
  dial(opts: Parameters<VerbBuilder['dial']>[0]): this { this.builder.dial(opts); return this; }
  /** Join or create a multi-party conference room. */
  conference(opts: Parameters<VerbBuilder['conference']>[0]): this { this.builder.conference(opts); return this; }
  /** Place the caller into a named queue. */
  enqueue(opts: Parameters<VerbBuilder['enqueue']>[0]): this { this.builder.enqueue(opts); return this; }
  /** Remove a caller from a queue and bridge them. */
  dequeue(opts: Parameters<VerbBuilder['dequeue']>[0]): this { this.builder.dequeue(opts); return this; }
  /** End the call. */
  hangup(opts?: Parameters<VerbBuilder['hangup']>[0]): this { this.builder.hangup(opts); return this; }
  /** Transfer control to a different webhook URL. */
  redirect(opts: Parameters<VerbBuilder['redirect']>[0]): this { this.builder.redirect(opts); return this; }
  /** Wait for a specified duration before continuing. */
  pause(opts: Parameters<VerbBuilder['pause']>[0]): this { this.builder.pause(opts); return this; }
  /** Leave a conference or queue. */
  leave(opts?: Parameters<VerbBuilder['leave']>[0]): this { this.builder.leave(opts); return this; }
  /** Reject an incoming call with a SIP error response. */
  sipDecline(opts: Parameters<VerbBuilder['sipDecline']>[0]): this { this.builder.sipDecline(opts); return this; }
  /** Send a SIP INFO or other request within the dialog. */
  sipRequest(opts: Parameters<VerbBuilder['sipRequest']>[0]): this { this.builder.sipRequest(opts); return this; }
  /** Transfer the call via SIP REFER. */
  sipRefer(opts: Parameters<VerbBuilder['sipRefer']>[0]): this { this.builder.sipRefer(opts); return this; }
  /** Set session-level defaults (TTS vendor/voice, STT vendor, VAD, etc.). */
  config(opts: Parameters<VerbBuilder['config']>[0]): this { this.builder.config(opts); return this; }
  /** Explicitly answer the call (sends a 200 OK). */
  answer(opts?: Parameters<VerbBuilder['answer']>[0]): this { this.builder.answer(opts); return this; }
  /** Send a SIP 180 Ringing with optional Alert-Info header. */
  alert(opts: Parameters<VerbBuilder['alert']>[0]): this { this.builder.alert(opts); return this; }
  /** Attach metadata to the call for tracking or routing. */
  tag(opts: Parameters<VerbBuilder['tag']>[0]): this { this.builder.tag(opts); return this; }
  /** Send DTMF tones into the call. */
  dtmf(opts: Parameters<VerbBuilder['dtmf']>[0]): this { this.builder.dtmf(opts); return this; }
  /** Mix an auxiliary audio track into the call. */
  dub(opts: Parameters<VerbBuilder['dub']>[0]): this { this.builder.dub(opts); return this; }
  /** Send an SMS or MMS message. */
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
  // Verb status events
  // ---------------------------------------------------------------------------

  /**
   * Enable real-time verb status events for this session.
   * Once enabled, the session emits 'verb:status' events for verb lifecycle
   * changes (starting, finished, start-playback, stop-playback, etc.).
   *
   * This is a convenience for `.config({ notifyEvents: true })` — it can be
   * chained into the initial verb sequence or called at any time.
   */
  notifyEvents(enabled = true): this {
    this.builder.config({ notifyEvents: enabled });
    return this;
  }

  // ---------------------------------------------------------------------------
  // Inject commands (immediate execution, bypass verb queue)
  // ---------------------------------------------------------------------------

  /** Send an inject command for immediate execution. */
  injectCommand(command: string, data?: unknown, callSid?: string): void {
    this.wsSend({
      type: 'command',
      command,
      ...(callSid ? { callSid } : {}),
      data: typeof data === 'object' && data !== null ? data : {},
    });
  }

  /** Redirect call execution to a new webhook. */
  injectRedirect(hook: string | { url: string; [key: string]: unknown }, callSid?: string): void {
    this.injectCommand('redirect', { call_hook: hook }, callSid);
  }

  /** Inject a whisper verb (say/play) to one party on the call. */
  injectWhisper(verb: Verb | Verb[], callSid?: string): void {
    const whisper = Array.isArray(verb) ? verb : [verb];
    this.injectCommand('whisper', { whisper }, callSid);
  }

  /** Mute or unmute the call. */
  injectMute(status: 'mute' | 'unmute', callSid?: string): void {
    this.injectCommand('mute:status', { mute_status: status }, callSid);
  }

  /** Enable or disable server-side noise isolation. */
  injectNoiseIsolation(
    status: 'enable' | 'disable',
    opts?: { vendor?: string; level?: number; model?: string },
    callSid?: string
  ): void {
    this.injectCommand('noiseIsolation:status', {
      noise_isolation_status: status,
      ...opts,
    }, callSid);
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
    const payload = typeof data === 'object' && data !== null ? data : { result: data };
    this.wsSend({
      type: 'command',
      command: 'llm:tool-output',
      tool_call_id: toolCallId,
      data: payload,
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
        case 'pipeline:event':
        case 'pipeline:tool-call':
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
          // Emit specific named event (e.g. 'tts:stream_open', 'tts:stream_closed')
          if (data?.event_type) {
            this.emit(`tts:${data.event_type}`, data);
          }
          // Keep generic event for catch-all usage
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
