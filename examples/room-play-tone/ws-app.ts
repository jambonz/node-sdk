import http from 'http';
import { createEndpoint } from '@jambonz/sdk/websocket';

/*
 * Play a tone (or any file/URL) into a Room, heard by every member, mid-call.
 *
 * The caller joins a Room. PLAY_DELAY_MS after joining, we call
 * session.injectPlay({...}) — the audio is mixed into the Room and heard by all
 * members. The optional `id` is echoed back on the play-start / play-done events.
 *
 * The room verb subscribes to the play lifecycle via statusEvents + statusHook.
 */

const server = http.createServer();
const makeService = createEndpoint({
  server,
  port: 3000,
  envVars: {
    ROOM_NAME: { type: 'string', description: 'Room name', default: 'demo-room' },
    PLAY_URL: { type: 'string', description: 'audio to play into the Room (file/http url or tone://)', default: 'tone://?freq=880&duration=400' },
    PLAY_DELAY_MS: { type: 'number', description: 'ms after joining before playing', default: 5000 },
  },
});

const svc = makeService({ path: '/room-play-tone' });

svc.on('session:new', (session) => {
  const env = session.data.env_vars || {};
  const room = env.ROOM_NAME || 'demo-room';
  const url = env.PLAY_URL || 'tone://?freq=880&duration=400';
  const playDelayMs = parseInt(env.PLAY_DELAY_MS ?? '5000', 10);

  console.log(`Incoming call ${session.callSid} -> Room '${room}', playing a tone in ${playDelayMs}ms`);

  let played = false;
  session
    .on('/room-status', (evt: Record<string, any>) => {
      console.log(`room status: ${evt?.event}`, { playId: evt?.play_id, id: evt?.id, reason: evt?.reason });
      // play once the caller has joined the Room
      if ((evt?.event === 'join' || evt?.event === 'start') && !played) {
        played = true;
        setTimeout(() => {
          console.log('>>> injectPlay into the Room');
          session.injectPlay({ url, id: 'tone' });
        }, Math.max(0, playDelayMs));
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
      statusEvents: ['start', 'end', 'join', 'leave', 'play-start', 'play-done'],
    })
    .send();
});

console.log('room-play-tone listening on port 3000 (path /room-play-tone)');
