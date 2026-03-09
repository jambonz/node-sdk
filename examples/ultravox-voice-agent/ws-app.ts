import http from 'http';
import { createEndpoint } from '@jambonz/sdk/websocket';

const server = http.createServer();
const makeService = createEndpoint({
  server,
  port: 3000,
  envVars: {
    ULTRAVOX_API_KEY: {
      type: 'string',
      description: 'Ultravox API key',
      required: true,
      obscure: true,
    },
  },
});

const svc = makeService({ path: '/ultravox-s2s' });

svc.on('session:new', (session) => {
  console.log(`Incoming call: ${session.callSid}`);
  console.log('  from: %s to: %s', session.data.from, session.data.to);
  console.log('  env_vars:', JSON.stringify(session.data.env_vars || {}));

  const apiKey = session.data.env_vars?.ULTRAVOX_API_KEY;
  if (!apiKey) {
    console.error('ERROR: ULTRAVOX_API_KEY not found in application environment variables');
    return;
  }

  session
    .on('/event', (_evt: Record<string, any>) => {
      // Ultravox events (state changes, transcripts, etc.)
    })
    .on('/toolCall', async (evt: Record<string, any>) => {
      const { name, args, tool_call_id } = evt;

      if (name === 'get_weather') {
        try {
          const scale = (args.scale || 'celsius').toLowerCase().startsWith('f') ? 'fahrenheit' : 'celsius';

          const geoRes = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(args.location)}&count=1&language=en&format=json`
          );
          const geoData = await geoRes.json() as any;
          if (!geoData.results?.length) throw new Error('location_not_found');

          const { latitude: lat, longitude: lng } = geoData.results[0];
          const wxRes = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m&temperature_unit=${scale}`
          );
          const weather = await wxRes.json();

          session.sendToolOutput(tool_call_id, {
            type: 'client_tool_result',
            invocation_id: tool_call_id,
            result: JSON.stringify(weather),
          });
        } catch (err) {
          session.sendToolOutput(tool_call_id, {
            type: 'client_tool_result',
            invocation_id: tool_call_id,
            result: JSON.stringify({ error: String(err) }),
          });
        }
      }
    })
    .on('/final', (evt: Record<string, any>) => {
      if (['server error', 'connection failure'].includes(evt.completion_reason)) {
        session.say({ text: 'Sorry, there was an error processing your request.' }).hangup();
      }
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
    .ultravox_s2s({
      auth: { apiKey },
      actionHook: '/final',
      eventHook: '/event',
      toolHook: '/toolCall',
      events: ['all'],
      llmOptions: {
        systemPrompt: `You are a helpful weather assistant.
You can look up current weather for any location using the get_weather tool.
When asked about weather, always use the tool to fetch real data — do not guess or make up temperatures.
After receiving tool results, report the temperature and wind speed to the user.
Give concise, friendly responses in plain text.`,
        selectedTools: [
          {
            temporaryTool: {
              modelToolName: 'get_weather',
              description: 'Get the weather at a given location',
              dynamicParameters: [
                { name: 'location', location: 'PARAMETER_LOCATION_BODY', required: true },
                { name: 'scale', location: 'PARAMETER_LOCATION_BODY', required: true,
                  schema: { type: 'string', enum: ['fahrenheit', 'celsius'], description: 'Temperature unit' } },
              ],
              client: {},
            },
          },
        ],
      },
    })
    .hangup()
    .send();
});

console.log('Ultravox voice agent listening on port 3000');
