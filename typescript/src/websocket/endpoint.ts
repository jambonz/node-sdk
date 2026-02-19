/**
 * createEndpoint — factory that attaches WebSocket handling to an HTTP server.
 * Returns a makeService function for registering path-based handlers.
 */

import http from 'http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { Logger } from '../types/common.js';
import { WsClient } from './client.js';
import { WsRouter } from './router.js';

export interface EndpointOptions {
  /** HTTP server to attach WebSocket handling to. */
  server: http.Server;
  /** Port to listen on (if server isn't already listening). */
  port?: number;
  /** Logger instance. */
  logger?: Logger;
  /** Middleware functions applied during upgrade. */
  middlewares?: Middleware[];
}

export type Middleware = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  next: (err?: Error) => void
) => void | Promise<void>;

export interface MakeService {
  (opts: { path: string }): WsClient;
}

const WS_PROTOCOL = 'ws.jambonz.org';

const defaultLogger: Logger = {
  info: () => {},
  error: () => {},
  debug: () => {},
};

export function createEndpoint(opts: EndpointOptions): MakeService {
  const { server, port, logger = defaultLogger, middlewares = [] } = opts;
  const router = new WsRouter();

  const wss = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols) => {
      if (protocols.has(WS_PROTOCOL)) return WS_PROTOCOL;
      return false;
    },
  });

  server.on('upgrade', (req: http.IncomingMessage, socket, head: Buffer) => {
    // Run middlewares
    const fakeRes = new http.ServerResponse(req);
    runMiddlewares(middlewares, req, fakeRes, (err) => {
      if (err) {
        logger.info({ err }, 'Endpoint: middleware rejected upgrade');
        socket.destroy();
        return;
      }

      const client = router.route(req);
      if (!client) {
        logger.debug({ url: req.url }, 'Endpoint: no route for WebSocket upgrade');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
        client.handle(ws, req);
      });
    });
  });

  if (port && !server.listening) {
    server.listen(port);
  }

  return function makeService({ path }: { path: string }): WsClient {
    const client = new WsClient(logger, path);
    router.use(path, client);
    return client;
  };
}

function runMiddlewares(
  middlewares: Middleware[],
  req: http.IncomingMessage,
  res: http.ServerResponse,
  done: (err?: Error) => void
): void {
  let i = 0;
  function next(err?: Error): void {
    if (err) return done(err);
    if (i >= middlewares.length) return done();
    const mw = middlewares[i++];
    try {
      const result = mw(req, res, next);
      if (result instanceof Promise) {
        result.catch(next);
      }
    } catch (e) {
      next(e instanceof Error ? e : new Error(String(e)));
    }
  }
  next();
}
