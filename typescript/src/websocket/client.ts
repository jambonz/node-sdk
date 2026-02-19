/**
 * WsClient — manages a jambonz WebSocket service on a specific path.
 * Handles session:new messages and creates Session objects.
 */

import { EventEmitter } from 'events';
import type { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Logger } from '../types/common.js';
import type { WsMessage } from '../types/session.js';
import { Session } from './session.js';

export interface WsClientEvents {
  'session:new': (session: Session, path: string, req?: IncomingMessage) => void;
  'session:redirect': (session: Session, path: string, req?: IncomingMessage) => void;
  error: (err: Error) => void;
}

export declare interface WsClient {
  on<E extends keyof WsClientEvents>(event: E, listener: WsClientEvents[E]): this;
  emit<E extends keyof WsClientEvents>(event: E, ...args: Parameters<WsClientEvents[E]>): boolean;
}

export class WsClient extends EventEmitter {
  private logger: Logger;
  private path: string;

  constructor(logger: Logger, path: string) {
    super();
    this.logger = logger;
    this.path = path;
  }

  /** Handle a new WebSocket connection. Called by the endpoint on upgrade. */
  handle(ws: WebSocket, req: IncomingMessage): void {
    const onMessage = (data: Buffer | ArrayBuffer | Buffer[]) => {
      try {
        const raw = typeof data === 'string' ? data : Buffer.from(data as Buffer).toString('utf-8');
        const msg = JSON.parse(raw) as WsMessage;
        this.onSessionMessage(ws, req, msg, onMessage);
      } catch (err) {
        this.logger.info({ err }, 'WsClient: error parsing message');
      }
    };

    ws.on('message', onMessage);
  }

  private onSessionMessage(
    ws: WebSocket,
    req: IncomingMessage,
    msg: WsMessage,
    onMessage: (data: Buffer | ArrayBuffer | Buffer[]) => void
  ): void {
    const { type } = msg;

    if (type === 'session:new' || type === 'session:adulting' || type === 'session:reconnect') {
      // Remove client-level message handler — session takes over
      ws.removeListener('message', onMessage);

      const session = new Session({ ws, msg, logger: this.logger });
      this.emit('session:new', session, this.path, req);
    } else if (type === 'session:redirect') {
      ws.removeListener('message', onMessage);

      const session = new Session({ ws, msg, logger: this.logger });
      if (this.listenerCount('session:redirect') > 0) {
        this.emit('session:redirect', session, this.path, req);
      } else {
        this.emit('session:new', session, this.path, req);
      }
    } else {
      this.logger.debug({ type }, 'WsClient: unexpected message type before session');
    }
  }
}
