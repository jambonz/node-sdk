import http from 'http';
import { createEndpoint } from '@jambonz/sdk/websocket';

/*
 * Start a 1:1 listen stream, then move the caller AND the live stream into a Room
 * — without dropping the stream's WebSocket.
 *
 * The caller is answered into a bidirectional `listen` (1:1 with the WS endpoint).
 * MOVE_DELAY_MS later we issue one live-call-control command:
 *   listen:status { listen_status: 'move-to-room', room }
 * jambonz joins the caller into the Room (creating it if needed) and re-homes the
 * existing listen fork into the Room as a member — the same socket keeps streaming,
 * now mixed for everyone in the Room.
 *
 * The listen verb MUST carry an `id` to be a managed (movable) stream.
 */

const server = http.createServer();
const makeService = createEndpoint({
  server,
  port: 3000,
  envVars: {
    LISTEN_WS_URL: { type: 'string', description: 'WebSocket URL for the listen stream', required: true },
    ROOM_NAME: { type: 'string', description: 'Room to move into', default: 'demo-room' },
    SAMPLE_RATE: { type: 'number', description: 'audio sample rate for the listen fork', default: 8000 },
    MOVE_DELAY_MS: { type: 'number', description: 'ms after answer before moving into the Room', default: 10000 },
  },
});

const svc = makeService({ path: '/listen-then-room' });

svc.on('session:new', (session) => {
  const env = session.data.env_vars || {};
  const listenUrl = env.LISTEN_WS_URL;
  const room = env.ROOM_NAME || 'demo-room';
  const sampleRate = parseInt(env.SAMPLE_RATE ?? '8000', 10);
  const moveDelayMs = parseInt(env.MOVE_DELAY_MS ?? '10000', 10);

  console.log(`Incoming call ${session.callSid} -> 1:1 listen, moving into Room '${room}' in ${moveDelayMs}ms`);
  if (!listenUrl) {
    console.error('LISTEN_WS_URL is not configured as an application environment variable');
    return;
  }

  let moved = false;
  const moveToRoom = () => {
    if (moved) return;
    moved = true;
    console.log(`>>> moving caller + listen stream into Room '${room}' (WebSocket preserved)`);
    // server-side this bundles the caller-join and adopts the listen fork as a
    // Room member.
    session.injectCommand('listen:status', { listen_status: 'move-to-room', room });
  };

  session
    .on('/listen-done', () => session.reply())
    .on('close', (code: number) => console.log(`session ${session.callSid} closed: ${code}`))
    .on('error', (err: Error) => console.error('session error:', err));

  // the fork connects well within the delay, so it exists by the time we move
  setTimeout(moveToRoom, Math.max(0, moveDelayMs));

  session
    .answer()
    .listen({
      id: 'caller-listen',                 // managed => movable
      url: listenUrl,
      sampleRate,
      bidirectionalAudio: { enabled: true, streaming: true, sampleRate },
      actionHook: '/listen-done',
    })
    .send();
});

console.log('listen-then-room listening on port 3000 (path /listen-then-room)');
