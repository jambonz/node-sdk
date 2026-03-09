import http from 'http';
import { createEndpoint } from '@jambonz/sdk/websocket';

const server = http.createServer();
const makeService = createEndpoint({
  server,
  port: 3000,
  envVars: {
    OPENAI_API_KEY: {
      type: 'string',
      description: 'OpenAI API key for Realtime',
      required: true,
      obscure: true,
    },
  },
});

const svc = makeService({ path: '/openai-s2s' });

svc.on('session:new', (session) => {
  console.log(`Incoming call: ${session.callSid}`);
  console.log('  from: %s to: %s', session.data.from, session.data.to);
  console.log('  env_vars:', JSON.stringify(session.data.env_vars || {}));

  const apiKey = session.data.env_vars?.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('ERROR: OPENAI_API_KEY not found in application environment variables');
    return;
  }

  session
    .on('/event', (_evt: Record<string, any>) => {
      // OpenAI Realtime events (conversation.item.*, response.audio_transcript.done, etc.)
    })
    .on('/toolCall', async (evt: Record<string, any>) => {
      const { name, args, tool_call_id } = evt;

      if (name === 'get_weather') {
        try {
          const geoRes = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(args.location)}&count=1&language=en&format=json`
          );
          const geoData = await geoRes.json() as any;
          if (!geoData.results?.length) throw new Error('location_not_found');

          const { latitude: lat, longitude: lng } = geoData.results[0];
          const wxRes = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m&temperature_unit=${args.scale}`
          );
          const weather = await wxRes.json();

          session.sendToolOutput(tool_call_id, {
            type: 'conversation.item.create',
            item: { type: 'function_call_output', call_id: tool_call_id, output: JSON.stringify(weather) },
          });
        } catch (err) {
          session.sendToolOutput(tool_call_id, {
            type: 'conversation.item.create',
            item: { type: 'function_call_output', call_id: tool_call_id, output: JSON.stringify({ error: String(err) }) },
          });
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
    .openai_s2s({
      model: 'gpt-4o-realtime-preview-2024-12-17',
      auth: { apiKey },
      actionHook: '/final',
      eventHook: '/event',
      toolHook: '/toolCall',
      events: [
        'conversation.item.*',
        'response.audio_transcript.done',
        'input_audio_buffer.committed',
      ],
      llmOptions: {
        response_create: {
          modalities: ['text', 'audio'],
          instructions: 'Please assist the user with their request.',
          voice: 'alloy',
          output_audio_format: 'pcm16',
          temperature: 0.8,
          max_output_tokens: 4096,
        },
        session_update: {
          tools: [
            {
              name: 'get_weather',
              type: 'function',
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
          tool_choice: 'auto',
          input_audio_transcription: { model: 'whisper-1' },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.8,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
          },
        },
      },
    })
    .hangup()
    .send();
});

console.log('OpenAI Realtime voice agent listening on port 3000');
