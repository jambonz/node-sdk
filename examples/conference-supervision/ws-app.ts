import http from 'http';
import { createEndpoint } from '@jambonz/sdk/websocket';
import type { Session, AudioStream } from '@jambonz/sdk/websocket';

/*
 * Conference supervision — the jambonz application side.
 *
 * Three call flows on one endpoint (point one jambonz application at each
 * path), plus the audio sink that receives a conference listen fork:
 *
 *   /caller      a normal participant; which room they join is the
 *                application's ROOM_NAME env var (portal-editable via
 *                OPTIONS discovery)
 *   /agent       joins the same room tagged 'agent' — the coach target
 *   /supervisor  joins muted (silent monitor); mode changes come later as
 *                mid-call participant actions (see monitor.ts)
 *   /fork        receives the room's mixed audio (L16 PCM) when a
 *                conference listen fork is started (see monitor.ts)
 *
 * Full reference app: https://github.com/jambonz/room-monitor
 */

const envVars = {
  ROOM_NAME: {
    type: 'string' as const,
    description: 'Conference room inbound callers join',
    default: 'support-room',
  },
};

const server = http.createServer();
const makeService = createEndpoint({ server, port: 3000, envVars });

const room = (session: Session): string =>
  (session.data.env_vars as Record<string, string> | undefined)?.ROOM_NAME || 'support-room';

/* -- a normal caller ------------------------------------------------------ */
makeService({ path: '/caller' }).on('session:new', (session) => {
  session
    .answer()
    .say({ text: 'Connecting you now.' })
    .conference({
      name: room(session),
      startConferenceOnEnter: true,
      endConferenceOnExit: false,
    })
    .send();
});

/* -- an agent: tagged, so coaching reaches them ---------------------------- */
makeService({ path: '/agent' }).on('session:new', (session) => {
  session
    .answer()
    .conference({
      name: room(session),
      memberTag: 'agent', // <- the coach target; also drives supervision UIs
      startConferenceOnEnter: true,
      endConferenceOnExit: false,
    })
    .send();

  // Tags are dynamic: promote/demote a live member without re-joining, e.g.
  //   session.injectCommand('conf:participant-action', { action: 'untag' });
  //   session.injectCommand('conf:participant-action', { action: 'tag', tag: 'agent' });
});

/* -- the supervisor: joins silent; modes switch mid-call ------------------- */
makeService({ path: '/supervisor' }).on('session:new', (session) => {
  console.log(`supervisor leg ${session.callSid} — use this call_sid with monitor.ts`);
  session
    .answer()
    .conference({
      name: room(session),
      joinMuted: true,               // hears everything, heard by no one
      memberTag: 'supervisor',       // lets tooling filter this leg out of counts
      startConferenceOnEnter: false, // never create/destroy the room being watched
      endConferenceOnExit: false,
      actionHook: '/conf-done',
    })
    .send();

  session.on('/conf-done', () => {
    session.hangup().reply();
  });
});

/* -- the audio fork sink: the room mix arrives here ------------------------ */
makeService.audio({ path: '/fork' }).on('connection', (stream: AudioStream) => {
  // the metadata you passed when starting the fork arrives verbatim as the
  // first text frame — make it self-describing (room, sampleRate)
  console.log('fork connected:', stream.metadata);

  let bytes = 0;
  stream.on('audio', (pcm: Buffer) => {
    bytes += pcm.length;
    // feed your STT / AI / recorder here — this is raw L16 PCM of the room
    // mix. Note: coached (whispered) audio is never present in this stream.
  });
  stream.on('close', () => console.log(`fork closed after ${bytes} bytes`));
});
