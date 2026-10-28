/**
 * createHarness — a complete jambonz harness server (Appendix A protocol) that works unchanged as a
 * pass-through to an OpenAI-compatible model, with hooks for the parts a developer cares about.
 */

import http from 'http';
import { timingSafeEqual } from 'crypto';
import type { Duplex } from 'stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { pino } from 'pino';
import { HarnessCall } from './call.js';
import { createModelClient } from './model.js';
import { HARNESS_PROTOCOL_VERSION, HARNESS_SUBPROTOCOL, type JambonzToHarnessMessage } from './protocol.js';
import type { HarnessOptions, HarnessServer } from './types.js';

/** How long a call's state is kept after its socket drops, waiting for `session:start {resumed: true}`. */
const RESUME_WINDOW_MS = 10_000;

function keyMatches(header: string | undefined, apiKey: string): boolean {
  const expected = Buffer.from(`Bearer ${apiKey}`);
  const got = Buffer.from(header ?? '');
  return got.length === expected.length && timingSafeEqual(got, expected);
}

function reject(socket: Duplex, status: number, text: string) {
  socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

/**
 * Create a harness server.
 *
 * @example
 * ```ts
 * import { createHarness } from '@jambonz/sdk/harness';
 * createHarness({ model: 'gpt-4.1-mini', instructions: 'You answer calls for Acme.' }).listen(8080);
 * ```
 */
export function createHarness(options: HarnessOptions = {}): HarnessServer {
  const log = options.logger ?? pino({ level: process.env.LOG_LEVEL ?? 'info' });
  const model = createModelClient(options.client);
  const calls = new Map<string, HarnessCall>();
  const detached = new Map<string, NodeJS.Timeout>();

  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, calls: calls.size }));
      return;
    }
    res.writeHead(426, { 'Content-Type': 'text/plain' });
    res.end(`WebSocket (${HARNESS_SUBPROTOCOL}) only\n`);
  });

  const wss = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols) => (protocols.has(HARNESS_SUBPROTOCOL) ? HARNESS_SUBPROTOCOL : false),
  });

  server.on('upgrade', (req, socket, head) => {
    const remote = req.socket.remoteAddress;
    if (options.apiKey && !keyMatches(req.headers.authorization, options.apiKey)) {
      log.warn({ remote, has_auth: !!req.headers.authorization }, 'harness connection rejected: bad or missing api key');
      return reject(socket, 401, 'Unauthorized');
    }
    const offered = (req.headers['sec-websocket-protocol'] ?? '').split(',').map((s) => s.trim());
    if (!offered.includes(HARNESS_SUBPROTOCOL)) {
      log.warn({ remote, offered }, `harness connection rejected: subprotocol ${HARNESS_SUBPROTOCOL} not offered`);
      return reject(socket, 400, 'Bad Request');
    }
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, remote));
  });

  function onConnection(ws: WebSocket, remote?: string) {
    let call: HarnessCall | undefined;
    let ready: Promise<void> = Promise.resolve();
    let ended = false;
    log.debug({ remote }, 'harness connection opened');

    ws.on('message', async (raw, isBinary) => {
      if (isBinary) {
        log.warn({ call_sid: call?.callSid }, 'binary frame ignored');
        return;
      }
      let msg: JambonzToHarnessMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        log.warn({ call_sid: call?.callSid }, 'unparseable message ignored');
        return;
      }
      if (!msg || typeof msg.type !== 'string') return;

      if (msg.type === 'session:start') {
        if (msg.protocol !== undefined && msg.protocol !== HARNESS_PROTOCOL_VERSION) {
          log.error({ call_sid: msg.call_sid, protocol: msg.protocol }, 'unsupported harness protocol version');
          ws.close(4000, `unsupported protocol ${msg.protocol}; this harness speaks ${HARNESS_PROTOCOL_VERSION}`);
          return;
        }
        const existing = calls.get(msg.call_sid);
        if (msg.resumed && existing && !existing.ended) {
          clearTimeout(detached.get(msg.call_sid));
          detached.delete(msg.call_sid);
          call = existing;
          call.attach(ws);
          call.log.info({ turn_id: msg.turn_id }, 'session resumed on a new socket');
          return;
        }
        call = new HarnessCall(msg, options, model, log);
        call.attach(ws);
        calls.set(msg.call_sid, call);
        call.log.info(
          { from: msg.from, to: msg.to, direction: msg.direction, tools: msg.tools?.length ?? 0, resumed: !!msg.resumed },
          msg.resumed ? 'session resumed, but its state was lost; starting fresh' : 'session started',
        );
        // later messages wait for onSessionStart, in order
        const c = call;
        ready = c.start().catch((err) => c.log.error({ err }, 'onSessionStart hook threw'));
        return;
      }

      if (!call) {
        log.warn({ type: msg.type, call_sid: (msg as { call_sid?: string }).call_sid }, 'message before session:start ignored');
        return;
      }
      if (msg.type === 'session:end') ended = true;
      const c = call;
      await ready;
      if (msg.type === 'session:end' && calls.get(c.callSid) === c) calls.delete(c.callSid);
      c.handle(msg);
    });

    ws.on('close', (code, reason) => {
      if (!call) return;
      const c = call;
      if (ended || c.ended) {
        c.log.debug({ code }, 'harness socket closed');
        return;
      }
      c.log.warn({ code, reason: reason.toString() }, 'harness socket closed without session:end; holding state for a resume');
      c.detach();
      detached.set(
        c.callSid,
        setTimeout(() => {
          detached.delete(c.callSid);
          if (calls.get(c.callSid) === c) calls.delete(c.callSid);
          void c.end({ type: 'session:end', call_sid: c.callSid, reason: 'socket_closed' });
        }, RESUME_WINDOW_MS),
      );
    });

    ws.on('error', (err) => log.error({ err, call_sid: call?.callSid }, 'harness socket error'));
  }

  return {
    listen(opts) {
      const { port, host } = typeof opts === 'number' ? { port: opts, host: undefined } : opts;
      return new Promise((resolve, rejectListen) => {
        server.once('error', rejectListen);
        server.listen(port, host, () => {
          server.off('error', rejectListen);
          const addr = server.address() as { port: number; address: string };
          log.info({ port: addr.port, host: addr.address, auth: !!options.apiKey }, 'jambonz harness listening');
          resolve({ port: addr.port, host: addr.address });
        });
      });
    },
    async close() {
      for (const t of detached.values()) clearTimeout(t);
      detached.clear();
      for (const ws of wss.clients) ws.terminate();
      calls.clear();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
