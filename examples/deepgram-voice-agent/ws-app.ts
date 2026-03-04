import http from 'http';
import { createEndpoint } from '@jambonz/sdk/websocket';

const server = http.createServer();
const makeService = createEndpoint({ server, port: 3000 });

const svc = makeService({ path: '/deepgram-s2s' });

svc.on('session:new', (session) => {
  console.log(`Incoming call: ${session.callSid}`);

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error('DEEPGRAM_API_KEY env variable is required');

  session
    .on('/event', (_evt: Record<string, any>) => {
      // Deepgram voice agent events
    })
    .on('/toolCall', async (evt: Record<string, any>) => {
      const { name, args, tool_call_id } = evt;

      if (name === 'get_weather') {
        try {
          const geoRes = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?name=${args.location}&count=1&language=en&format=json`
          );
          const geoData = await geoRes.json() as any;
          if (!geoData.results?.length) throw new Error('location_not_found');

          const { latitude: lat, longitude: lng } = geoData.results[0];
          const wxRes = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m&temperature_unit=${args.scale}`
          );
          const weather = await wxRes.json();

          session.sendToolOutput(tool_call_id, {
            type: 'FunctionCallResponse',
            function_call_id: tool_call_id,
            output: weather,
          });
        } catch (err) {
          session.sendToolOutput(tool_call_id, { error: String(err) });
        }
      }
    })
    .on('/final', (evt: Record<string, any>) => {
      if (['server failure', 'server error'].includes(evt.completion_reason)) {
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
    .say({ text: 'Hello, how can I help you today?' })
    .llm({
      vendor: 'deepgram',
      model: 'voice-agent',
      auth: { apiKey },
      actionHook: '/final',
      eventHook: '/event',
      toolHook: '/toolCall',
      events: ['all'],
      llmOptions: {
        settingsConfiguration: {
          type: 'SettingsConfiguration',
          agent: {
            listen: { model: 'nova-3' },
            think: {
              model: 'gpt-4o-mini',
              provider: { type: 'open_ai' },
              instructions: 'Please help the user with their request.',
              functions: [
                {
                  name: 'get_weather',
                  description: 'Get the weather at a given location',
                  parameters: {
                    type: 'object',
                    properties: {
                      location: { type: 'string', description: 'Location to get the weather from' },
                      scale: { type: 'string', enum: ['fahrenheit', 'celsius'] },
                    },
                    required: ['location', 'scale'],
                  },
                },
              ],
            },
          },
        },
      },
    })
    .hangup()
    .send();
});

console.log('Deepgram voice agent listening on port 3000');
