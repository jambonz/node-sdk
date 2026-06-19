import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'events';
import { Session } from '../src/websocket/session.js';

// Minimal WebSocket stand-in: an EventEmitter (so the Session can wire its
// 'message' handler) with readyState OPEN and a send() that captures frames.
function makeSession() {
  const ws = new EventEmitter() as EventEmitter & {
    readyState: number;
    send: (data: string) => void;
  };
  ws.readyState = 1; // OPEN
  const sent: Array<Record<string, unknown>> = [];
  ws.send = (data: string) => sent.push(JSON.parse(data));

  const logger = { debug() {}, info() {}, warn() {}, error() {} };
  const msg = { type: 'session:new', msgid: 'init-1', call_sid: 'cs1', data: {} };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = new Session({ ws, msg, logger, validate: false } as any);
  return { session, ws, sent };
}

const acksFor = (sent: Array<Record<string, unknown>>, msgid: string) =>
  sent.filter((m) => m.type === 'ack' && m.msgid === msgid);

describe('Session verb:hook ack behavior', () => {
  it('auto-acks a notification hook (data.event) after emitting it to the listener', () => {
    const { session, ws, sent } = makeSession();
    const seen: Array<{ event?: string }> = [];
    session.on('/room-status', (data) => seen.push(data as { event?: string }));

    ws.emit('message', JSON.stringify({
      type: 'verb:hook', msgid: 'evt-1', hook: '/room-status',
      data: { event: 'say-start', sayId: 's1', id: 'welcome' },
    }));

    expect(seen).toHaveLength(1);
    expect(seen[0].event).toBe('say-start');
    const acks = acksFor(sent, 'evt-1');
    expect(acks).toHaveLength(1);
    expect(acks[0].data).toEqual([]); // empty ack, no verbs
  });

  it('does NOT auto-ack an action hook (no data.event) — the app owns the reply', () => {
    const { session, ws, sent } = makeSession();
    session.on('/dial-done', () => { /* a real app would session.reply() here */ });

    ws.emit('message', JSON.stringify({
      type: 'verb:hook', msgid: 'evt-2', hook: '/dial-done',
      data: { dial_call_status: 'completed' },
    }));

    expect(acksFor(sent, 'evt-2')).toHaveLength(0);
  });

  it('still auto-acks a hook with no listener (unchanged behavior)', () => {
    const { ws, sent } = makeSession();
    ws.emit('message', JSON.stringify({
      type: 'verb:hook', msgid: 'evt-3', hook: '/no-listener', data: {},
    }));
    expect(acksFor(sent, 'evt-3')).toHaveLength(1);
  });
});
