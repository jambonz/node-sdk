import http from 'http';
import { createEndpoint } from '@jambonz/sdk/websocket';

const server = http.createServer();
const makeService = createEndpoint({
  server,
  port: 3000,
  envVars: {
    OPENAI_API_KEY: {
      type: 'string',
      description: 'OpenAI API key for LLM',
      required: true,
      obscure: true,
    },
  },
});

const svc = makeService({ path: '/pipeline' });

const systemPrompt = `You are a helpful weather assistant.
You can look up current weather for any location using the get_weather tool.
When asked about weather, always use the tool to fetch real data — do not guess or make up temperatures.
Give concise, friendly responses in plain text without markdown, asterisks, or bullets.`;

const weatherTool = {
  name: 'get_weather',
  description: 'Get the current temperature and wind speed for a given location.',
  parameters: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'City name or location, e.g. "San Francisco" or "Paris"',
      },
      scale: {
        type: 'string',
        enum: ['celsius', 'fahrenheit'],
        description: 'Temperature unit, defaults to celsius',
      },
    },
    required: ['location'],
  },
};

svc.on('session:new', (session) => {
  console.log(`Incoming call: ${session.callSid}`);
  console.log('  from: %s to: %s', session.data.from, session.data.to);
  console.log('  env_vars:', JSON.stringify(session.data.env_vars || {}));

  const apiKey = session.data.env_vars?.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('ERROR: OPENAI_API_KEY not found in application environment variables');
    console.error('  Configure it in the jambonz portal under your application settings');
    return;
  }

  session
    .on('/event', (evt: Record<string, any>) => {
      console.log('pipeline event:', evt.type);
    })
    .on('/toolCall', async (evt: Record<string, any>) => {
      const { tool_call_id, name, arguments: args } = evt;
      console.log(`tool call: ${name}`, JSON.stringify(args));

      try {
        if (name === 'get_weather') {
          const { location, scale = 'celsius' } = args;

          const geoRes = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`
          );
          const geoData = await geoRes.json() as any;
          if (!geoData.results?.length) throw new Error('location_not_found');

          const { latitude: lat, longitude: lng } = geoData.results[0];
          const wxRes = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m&temperature_unit=${scale}`
          );
          const weather = await wxRes.json() as any;
          const { temperature_2m, wind_speed_10m } = weather.current;
          const unit = scale === 'fahrenheit' ? '°F' : '°C';

          session.sendToolOutput(tool_call_id,
            `The current temperature in ${location} is ${temperature_2m}${unit} with wind speed ${wind_speed_10m} km/h.`
          );
          return;
        }
        session.sendToolOutput(tool_call_id, `Unknown tool: ${name}`);
      } catch (err: any) {
        if (err.message === 'location_not_found') {
          session.sendToolOutput(tool_call_id, `Sorry, I could not find weather data for "${args?.location}".`);
        } else {
          session.sendToolOutput(tool_call_id, `Error fetching weather: ${err.message}`);
        }
      }
    })
    .on('/action', (evt: Record<string, any>) => {
      console.log('pipeline ended:', evt.completion_reason);
      session.reply();
    })
    .on('close', (code: number) => {
      console.log(`Session ${session.callSid} closed: ${code}`);
    })
    .on('error', (err: Error) => {
      console.error(`Session ${session.callSid} error:`, err);
    });

  session
    .pipeline({
      stt: {
        vendor: 'deepgram',
        language: 'en-US',
      },
      llm: {
        vendor: 'openai',
        model: 'gpt-4o',
        auth: { apiKey },
        llmOptions: {
          maxTokens: 1024,
          systemPrompt,
          tools: [weatherTool],
        },
      },
      tts: {
        vendor: 'deepgram',
        voice: 'aura-2-andromeda-en',
      },
      vad: {
        vendor: 'silero',
      },
      toolHook: '/toolCall',
      eventHook: '/event',
      actionHook: '/action',
    })
    .send();
});

console.log('Pipeline voice agent listening on port 3000');
