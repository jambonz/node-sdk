import http from 'http';
import { createEndpoint } from '@jambonz/sdk/websocket';

/*
 * A Room with a nested audio stream.
 *
 * The caller is answered straight into a Room whose `stream` property forks the
 * room's mixed audio to a WebSocket endpoint. With bidirectionalAudio enabled,
 * whatever the endpoint streams back is mixed into the room and heard by every
 * member — so the stream socket is effectively a participant in the Room.
 *
 * (`stream` is the preferred synonym for the nested `listen` property.)
 */

const server = http.createServer();
const makeService = createEndpoint({
  server,
  port: 3000,
  envVars: {
    STREAM_WS_URL: { type: 'string', description: 'WebSocket URL to stream the room audio to', required: true },
    ROOM_NAME: { type: 'string', description: 'Room name', default: 'demo-room' },
    SAMPLE_RATE: { type: 'number', description: 'audio sample rate for the stream', default: 8000 },
  },
});

const svc = makeService({ path: '/room-with-stream' });

svc.on('session:new', (session) => {
  const env = session.data.env_vars || {};
  const streamUrl = env.STREAM_WS_URL;
  const room = env.ROOM_NAME || 'demo-room';
  const sampleRate = parseInt(env.SAMPLE_RATE ?? '8000', 10);

  console.log(`Incoming call ${session.callSid} -> Room '${room}' with a nested audio stream`);
  if (!streamUrl) {
    console.error('STREAM_WS_URL is not configured as an application environment variable');
    return;
  }

  session
    .on('/room-done', () => session.reply())       // room verb completed (caller left)
    .on('/stream-event', (evt: Record<string, any>) => console.log('stream event:', evt?.type))
    .on('close', (code: number) => console.log(`session ${session.callSid} closed: ${code}`))
    .on('error', (err: Error) => console.error('session error:', err));

  session
    .answer()
    .room({
      name: room,
      beep: true,
      actionHook: '/room-done',
      // nested stream: fork the room's audio to STREAM_WS_URL; audio streamed back
      // is mixed into the room (bidirectional).
      stream: {
        url: streamUrl,
        sampleRate,
        bidirectionalAudio: { enabled: true, streaming: true, sampleRate },
        actionHook: '/stream-event',
      },
    })
    .send();
});

console.log('room-with-stream listening on port 3000 (path /room-with-stream)');
