import http from 'http';
import { createEndpoint } from '@jambonz/sdk/websocket';

/*
 * Connect a caller to an Ultravox speech-to-speech agent, then move BOTH the
 * caller and the agent into a Room — keeping the same conversation and the vendor
 * WebSocket alive.
 *
 * The caller is answered into a 1:1 Ultravox s2s session. Once the agent is live
 * (first event), we wait MOVE_DELAY_MS and issue one live-call-control command:
 *   llm:status { llm_status: 'move-to-room', room }
 * jambonz joins the caller into the Room (created if needed) and re-homes the
 * agent's s2s engine into the Room as a member — no reconnect, the agent now
 * hears (and is heard by) the whole Room.
 *
 * Set MOVE_DELAY_MS=0 to land the caller + agent in the Room immediately.
 */

const server = http.createServer();
const makeService = createEndpoint({
  server,
  port: 3000,
  envVars: {
    ULTRAVOX_API_KEY: { type: 'string', description: 'Ultravox API key', required: true, obscure: true },
    ULTRAVOX_AGENT_ID: { type: 'string', description: 'Ultravox agent id', required: true },
    ROOM_NAME: { type: 'string', description: 'Room to move into', default: 'agent-room' },
    MOVE_DELAY_MS: { type: 'number', description: 'ms after the agent connects before moving into a Room', default: 15000 },
  },
});

const svc = makeService({ path: '/s2s-move-to-room' });

svc.on('session:new', (session) => {
  const env = session.data.env_vars || {};
  const apiKey = env.ULTRAVOX_API_KEY;
  const agentId = env.ULTRAVOX_AGENT_ID;
  const room = env.ROOM_NAME || 'agent-room';
  const moveDelayMs = parseInt(env.MOVE_DELAY_MS ?? '15000', 10);

  console.log(`Incoming call ${session.callSid} -> Ultravox s2s; moving into Room '${room}' ${moveDelayMs}ms after connect`);
  if (!apiKey || !agentId) {
    console.error('ULTRAVOX_API_KEY and ULTRAVOX_AGENT_ID must be configured as application environment variables');
    session.say({ text: 'Configuration error.' }).hangup().send();
    return;
  }

  let armed = false;
  let moved = false;
  const moveToRoom = () => {
    if (moved) return;
    moved = true;
    console.log(`>>> moving caller + agent into Room '${room}' (vendor WebSocket preserved)`);
    session.injectCommand('llm:status', { llm_status: 'move-to-room', room });
  };

  session
    .on('/event', () => {
      // the first agent event fires only after the vendor WebSocket connects, so
      // the s2s engine exists server-side; arm the move timer from here.
      if (!armed) {
        armed = true;
        setTimeout(moveToRoom, Math.max(0, moveDelayMs));
      }
    })
    .on('/final', () => session.reply())          // s2s (llm) verb completed
    .on('close', (code: number) => console.log(`session ${session.callSid} closed: ${code}`))
    .on('error', (err: Error) => console.error('session error:', err));

  session
    .answer()
    .ultravox_s2s({
      auth: { apiKey, agent_id: agentId },
      actionHook: '/final',
      eventHook: '/event',
      events: ['all'],
      llmOptions: {},
    })
    .hangup()
    .send();
});

console.log('s2s-move-to-room listening on port 3000 (path /s2s-move-to-room)');
