import http from 'http';
import { createEndpoint } from '@jambonz/sdk/websocket';

/*
 * Speak TTS into a Room, heard by every member, mid-call.
 *
 * The caller joins a Room. SAY_DELAY_MS after joining, we call
 * session.injectSay({...}) — a one-shot announcement synthesized into the Room and
 * heard by all members (not just the caller). The optional `id` is echoed back on
 * the say-start / say-done events so you can correlate them.
 *
 * The room verb subscribes to the say lifecycle via statusEvents + statusHook;
 * say-start fires when audio begins, say-done when it finishes.
 */

const server = http.createServer();
const makeService = createEndpoint({
  server,
  port: 3000,
  envVars: {
    ROOM_NAME: { type: 'string', description: 'Room name', default: 'demo-room' },
    SAY_TEXT: { type: 'string', description: 'text to announce into the Room', default: 'Welcome — this announcement is heard by everyone in the room.' },
    SAY_VENDOR: { type: 'string', description: 'TTS vendor (optional; account default if unset)', required: false },
    SAY_DELAY_MS: { type: 'number', description: 'ms after joining before the announcement', default: 5000 },
  },
});

const svc = makeService({ path: '/room-say' });

svc.on('session:new', (session) => {
  const env = session.data.env_vars || {};
  const room = env.ROOM_NAME || 'demo-room';
  const text = env.SAY_TEXT || 'Welcome — this announcement is heard by everyone in the room.';
  const synthesizer = env.SAY_VENDOR ? { vendor: env.SAY_VENDOR } : undefined;
  const sayDelayMs = parseInt(env.SAY_DELAY_MS ?? '5000', 10);

  console.log(`Incoming call ${session.callSid} -> Room '${room}', announcing in ${sayDelayMs}ms`);

  let announced = false;
  session
    .on('/room-status', (evt: Record<string, any>) => {
      console.log(`room status: ${evt?.event}`, { sayId: evt?.say_id, id: evt?.id, reason: evt?.reason });
      // announce once the caller has joined the Room
      if ((evt?.event === 'join' || evt?.event === 'start') && !announced) {
        announced = true;
        setTimeout(() => {
          console.log('>>> injectSay into the Room');
          session.injectSay({ text, id: 'announcement', ...(synthesizer && { synthesizer }) });
        }, Math.max(0, sayDelayMs));
      }
    })
    .on('/room-done', () => session.reply())
    .on('close', (code: number) => console.log(`session ${session.callSid} closed: ${code}`))
    .on('error', (err: Error) => console.error('session error:', err));

  session
    .answer()
    .room({
      name: room,
      actionHook: '/room-done',
      statusHook: '/room-status',
      statusEvents: ['start', 'end', 'join', 'leave', 'say-start', 'say-done'],
    })
    .send();
});

console.log('room-say listening on port 3000 (path /room-say)');
