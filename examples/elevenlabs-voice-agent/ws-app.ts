import http from 'http';
import { createEndpoint } from '@jambonz/sdk/websocket';

const server = http.createServer();
const makeService = createEndpoint({
  server,
  port: 3000,
  envVars: {
    ELEVENLABS_AGENT_ID: {
      type: 'string',
      description: 'ElevenLabs Conversational AI agent ID',
      required: true,
    },
    ELEVENLABS_API_KEY: {
      type: 'string',
      description: 'ElevenLabs API key (optional, enables signed URLs)',
      obscure: true,
    },
  },
});

const svc = makeService({ path: '/elevenlabs-s2s' });

svc.on('session:new', (session) => {
  console.log(`Incoming call: ${session.callSid}`);
  console.log('  from: %s to: %s', session.data.from, session.data.to);

  const agentId = session.data.env_vars?.ELEVENLABS_AGENT_ID;
  const apiKey = session.data.env_vars?.ELEVENLABS_API_KEY;

  if (!agentId) {
    console.error('ERROR: ELEVENLABS_AGENT_ID not found in application environment variables');
    return;
  }

  const auth: Record<string, string> = { agent_id: agentId };
  if (apiKey) auth.api_key = apiKey;

  session
    .on('/event', (_evt: Record<string, any>) => {
      // ElevenLabs events (user_transcript, agent_response, etc.)
    })
    .on('/toolCall', async (evt: Record<string, any>) => {
      const { name, args, tool_call_id } = evt;
      console.log(`Tool call: ${name}`, args);

      // Return tool results in ElevenLabs client_tool_result format
      session.sendToolOutput(tool_call_id, {
        type: 'client_tool_result',
        tool_call_id,
        result: JSON.stringify({ error: `Unknown tool: ${name}` }),
        is_error: true,
      });
    })
    .on('/final', (evt: Record<string, any>) => {
      console.log(`Session ${session.callSid} completed: ${evt.completion_reason}`);
      session.reply();
    })
    .on('close', (code: number) => {
      console.log(`Session ${session.callSid} closed: ${code}`);
    })
    .on('error', (err: Error) => {
      console.error(`Session ${session.callSid} error:`, err);
    });

  session
    .answer()
    .pause({ length: 1 })
    .elevenlabs_s2s({
      auth,
      llmOptions: {},
      actionHook: '/final',
      eventHook: '/event',
      toolHook: '/toolCall',
      events: ['all'],
    })
    .hangup()
    .send();
});

console.log('ElevenLabs voice agent listening on port 3000');
