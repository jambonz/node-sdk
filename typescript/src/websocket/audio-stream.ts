/**
 * AudioStream — represents a single listen/stream audio WebSocket connection.
 * Wraps the raw WebSocket for the audio.drachtio.org protocol.
 *
 * Receives: L16 PCM binary frames + JSON text events (dtmf, playDone, mark)
 * Sends: binary PCM (streaming mode) or JSON commands (playAudio, killAudio, etc.)
 */

import { EventEmitter } from 'events';
import type { WebSocket } from 'ws';
import type { Logger } from '../types/common.js';

/** Metadata sent by jambonz in the initial text frame. */
export interface AudioStreamMetadata {
  callSid: string;
  from: string;
  to: string;
  callId: string;
  sampleRate: number;
  mixType: 'mono' | 'stereo' | 'mixed';
  accountSid?: string;
  applicationSid?: string;
  direction?: string;
  [key: string]: unknown;
}

export interface PlayAudioOptions {
  /** Audio encoding: 'raw' (headerless L16) or 'wav'/'wave'. Default: 'raw'. */
  audioContentType?: string;
  /** Sample rate for raw audio. Default: stream's sampleRate. */
  sampleRate?: number;
  /** Optional ID — returned in the playDone event. */
  id?: string;
  /** If true, queue after current playback. If false (default), interrupt current. */
  queuePlay?: boolean;
}

export interface AudioStreamEvents {
  /** Raw L16 PCM audio data from the call. */
  audio: (data: Buffer) => void;
  /** DTMF event (only if passDtmf was enabled on the listen verb). */
  dtmf: (evt: { digit: string; duration?: number }) => void;
  /** Non-streaming playback completed. */
  playDone: (evt: { id?: string; [key: string]: unknown }) => void;
  /** Mark reached playout or was cleared. */
  mark: (evt: { name: string; event: 'playout' | 'cleared' }) => void;
  /** Connection closed. */
  close: (code: number, reason: string) => void;
  /** Error on the underlying WebSocket. */
  error: (err: Error) => void;
}

export declare interface AudioStream {
  on<E extends keyof AudioStreamEvents>(event: E, listener: AudioStreamEvents[E]): this;
  emit<E extends keyof AudioStreamEvents>(event: E, ...args: Parameters<AudioStreamEvents[E]>): boolean;
}

export class AudioStream extends EventEmitter {
  readonly metadata: AudioStreamMetadata;
  readonly callSid: string;
  readonly sampleRate: number;

  private ws: WebSocket;
  private logger: Logger;

  constructor(ws: WebSocket, metadata: AudioStreamMetadata, logger: Logger) {
    super();
    this.ws = ws;
    this.logger = logger;
    this.metadata = metadata;
    this.callSid = metadata.callSid;
    this.sampleRate = metadata.sampleRate;

    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      if (isBinary) {
        this.emit('audio', Buffer.from(data as Buffer));
      } else {
        this.onTextMessage(data);
      }
    });

    ws.on('close', (code: number, reason: Buffer) => {
      this.emit('close', code, reason.toString());
    });

    ws.on('error', (err: Error) => {
      this.emit('error', err);
    });
  }

  /** Send raw L16 PCM audio back to the caller (streaming mode). */
  sendAudio(pcm: Buffer): void {
    if (this.ws.readyState === 1) {
      this.ws.send(pcm);
    }
  }

  /** Send a playAudio command with base64-encoded audio (non-streaming mode). */
  playAudio(audioContent: string, opts?: PlayAudioOptions): void {
    this.sendJson({
      type: 'playAudio',
      data: {
        audioContent,
        audioContentType: opts?.audioContentType ?? 'raw',
        sampleRate: opts?.sampleRate ?? this.sampleRate,
        ...(opts?.id !== undefined ? { id: opts.id } : {}),
        ...(opts?.queuePlay !== undefined ? { queuePlay: opts.queuePlay } : {}),
      },
    });
  }

  /** Stop any currently playing audio and flush the buffer. */
  killAudio(): void {
    this.sendJson({ type: 'killAudio' });
  }

  /** Tell jambonz to close the connection and end the listen verb. */
  disconnect(): void {
    this.sendJson({ type: 'disconnect' });
  }

  /** Insert a synchronization marker. */
  sendMark(name: string): void {
    this.sendJson({ type: 'mark', data: { name } });
  }

  /** Clear all pending markers. */
  clearMarks(): void {
    this.sendJson({ type: 'clearMarks' });
  }

  /** Close the WebSocket connection. */
  close(): void {
    this.ws.close();
  }

  private onTextMessage(raw: Buffer | ArrayBuffer | Buffer[]): void {
    try {
      const str = typeof raw === 'string' ? raw : Buffer.from(raw as Buffer).toString('utf-8');
      const msg = JSON.parse(str);

      // DTMF events use {event: 'dtmf', dtmf, duration}
      if (msg.event === 'dtmf') {
        this.emit('dtmf', { digit: msg.dtmf, duration: msg.duration });
        return;
      }

      // All other events use {type: '...', data: {...}}
      switch (msg.type) {
        case 'playDone':
          this.emit('playDone', msg.data ?? {});
          break;
        case 'mark':
          this.emit('mark', msg.data ?? {});
          break;
        default:
          this.logger.debug({ msg }, 'AudioStream: unhandled text message');
      }
    } catch (err) {
      this.logger.info({ err }, 'AudioStream: error parsing text message');
    }
  }

  private sendJson(msg: Record<string, unknown>): void {
    if (this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}
