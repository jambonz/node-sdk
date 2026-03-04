/**
 * createEndpoint — factory that attaches WebSocket handling to an HTTP server.
 * Returns a makeService function for registering path-based handlers.
 * Supports both the jambonz control protocol (ws.jambonz.org) and the
 * audio streaming protocol (audio.drachtio.org) on the same server.
 */

import http from 'http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { Logger, EnvVarSchema } from '../types/common.js';
import { WsClient } from './client.js';
import { AudioClient } from './audio-client.js';
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
  /** Application environment variables schema. When provided, the SDK
   *  auto-responds to HTTP OPTIONS requests with this schema so the
   *  jambonz portal can discover configurable parameters. */
  envVars?: EnvVarSchema;
}

export type Middleware = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  next: (err?: Error) => void
) => void | Promise<void>;

export interface MakeService {
  (opts: { path: string }): WsClient;
  /** Register an audio WebSocket handler for listen/stream connections. */
  audio: (opts: { path: string }) => AudioClient;
}

const WS_PROTOCOL = 'ws.jambonz.org';
const AUDIO_PROTOCOL = 'audio.drachtio.org';

const defaultLogger: Logger = {
  info: () => {},
  error: () => {},
  debug: () => {},
};

/**
 * Create a jambonz WebSocket endpoint on an HTTP server.
 *
 * Returns a {@link MakeService} factory for registering path-based control
 * and audio WebSocket handlers. Supports both the jambonz control protocol
 * (`ws.jambonz.org`) and the audio streaming protocol (`audio.drachtio.org`).
 *
 * @example
 * ```typescript
 * const server = http.createServer();
 * const makeService = createEndpoint({ server, port: 3000 });
 *
 * const svc = makeService({ path: '/' });
 * const audioSvc = makeService.audio({ path: '/audio' });
 * ```
 */
export function createEndpoint(opts: EndpointOptions): MakeService {
  const { server, port, logger = defaultLogger, middlewares = [], envVars } = opts;
  const router = new WsRouter();

  // Control protocol WebSocket server
  const wss = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols) => {
      if (protocols.has(WS_PROTOCOL)) return WS_PROTOCOL;
      return false;
    },
  });

  // Audio protocol WebSocket server
  const audioWss = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols) => {
      if (protocols.has(AUDIO_PROTOCOL)) return AUDIO_PROTOCOL;
      return false;
    },
  });

  // Audio path registry (exact match — no prefix routing needed)
  const audioRoutes = new Map<string, AudioClient>();

  // Handle regular HTTP requests (OPTIONS for env var discovery, 426 for everything else)
  server.on('request', (req: http.IncomingMessage, res: http.ServerResponse) => {
    if (req.method === 'OPTIONS' && envVars) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(envVars));
      return;
    }
    res.writeHead(426, { 'Content-Type': 'text/plain' });
    res.end('Upgrade Required');
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

      // Route by path first: audio routes take priority (exact match)
      const pathname = req.url?.split('?')[0] ?? '/';
      const audioClient = audioRoutes.get(pathname);
      if (audioClient) {
        audioWss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
          audioClient.handle(ws, req);
        });
        return;
      }

      // Control WebSocket — path-prefix routing
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

  const makeService = function makeService({ path }: { path: string }): WsClient {
    const client = new WsClient(logger, path);
    router.use(path, client);
    return client;
  } as MakeService;

  makeService.audio = function audio({ path }: { path: string }): AudioClient {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    const client = new AudioClient(logger, normalized);
    audioRoutes.set(normalized, client);
    return client;
  };

  return makeService;
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
