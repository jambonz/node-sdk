/**
 * AudioClient — manages audio WebSocket connections on a specific path.
 * Analogous to WsClient but for the audio.drachtio.org protocol.
 *
 * Waits for the initial JSON metadata text frame, then creates an AudioStream.
 */

import { EventEmitter } from 'events';
import type { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Logger } from '../types/common.js';
import { AudioStream, type AudioStreamMetadata } from './audio-stream.js';

export interface AudioClientEvents {
  connection: (stream: AudioStream, req: IncomingMessage) => void;
  error: (err: Error) => void;
}

export declare interface AudioClient {
  on<E extends keyof AudioClientEvents>(event: E, listener: AudioClientEvents[E]): this;
  emit<E extends keyof AudioClientEvents>(event: E, ...args: Parameters<AudioClientEvents[E]>): boolean;
}

export class AudioClient extends EventEmitter {
  private logger: Logger;
  readonly path: string;

  constructor(logger: Logger, path: string) {
    super();
    this.logger = logger;
    this.path = path;
  }

  /** Handle a new audio WebSocket connection. */
  handle(ws: WebSocket, req: IncomingMessage): void {
    const onFirstMessage = (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      ws.removeListener('message', onFirstMessage);

      if (isBinary) {
        this.logger.info('AudioClient: expected JSON metadata as first message, got binary');
        ws.close();
        return;
      }

      try {
        const raw = typeof data === 'string' ? data : Buffer.from(data as Buffer).toString('utf-8');
        const metadata = JSON.parse(raw) as AudioStreamMetadata;
        const stream = new AudioStream(ws, metadata, this.logger);
        this.emit('connection', stream, req);
      } catch (err) {
        this.logger.info({ err }, 'AudioClient: error parsing initial metadata');
        ws.close();
      }
    };

    ws.on('message', onFirstMessage);
  }
}
