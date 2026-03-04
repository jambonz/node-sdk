import Anthropic from '@anthropic-ai/sdk';
import http from 'http';
import { createEndpoint } from '@jambonz/sdk/websocket';

const ANTHROPIC_MODEL = 'claude-3-5-haiku-latest';
const systemPrompt = `You are a helpful conversational AI voice bot.
Please keep your answers short and to the point; the user will follow up with more questions if needed.
Please reply with unadorned text that can be read aloud to the user using a TTS engine`;

const server = http.createServer();
const makeService = createEndpoint({ server, port: 3000 });

const svc = makeService({ path: '/llm-streaming' });

svc.on('session:new', (session) => {
  console.log(`Incoming call: ${session.callSid}`);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY env variable is required');

  const client = new Anthropic({ apiKey });
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  let assistantResponse = '';
  let userInterrupt = false;

  session
    .on('/speech-detected', async (evt: Record<string, any>) => {
      const { speech } = evt;

      // Acknowledge the hook immediately so jambonz can continue
      session.reply();

      if (speech?.is_final) {
        const { transcript } = speech.alternatives[0];
        messages.push({ role: 'user', content: transcript });
        userInterrupt = false;

        const stream = await client.messages.create({
          model: ANTHROPIC_MODEL,
          max_tokens: 1024,
          system: systemPrompt,
          messages,
          stream: true,
        });

        for await (const event of stream) {
          if (userInterrupt) {
            messages.push({ role: 'assistant', content: `${assistantResponse}...` });
            assistantResponse = '';
            break;
          }

          if ((event as any).delta?.text) {
            const tokens = (event as any).delta.text;
            assistantResponse += tokens;
            session.sendTtsTokens(tokens).catch((err: Error) =>
              console.error('Error sending TTS tokens:', err)
            );
          } else if (event.type === 'message_stop') {
            session.flushTtsTokens();
            messages.push({ role: 'assistant', content: assistantResponse });
            assistantResponse = '';
          }
        }
      }
    })
    .on('tts:streaming-event', (_evt: Record<string, any>) => {
      // TTS streaming lifecycle events
    })
    .on('tts:user_interrupt', () => {
      console.log(`Session ${session.callSid}: user interrupted`);
      userInterrupt = true;
    })
    .on('close', (code: number) => {
      console.log(`Session ${session.callSid} closed: ${code}`);
    })
    .on('error', (err: Error) => {
      console.error(`Session ${session.callSid} error:`, err);
    });

  session
    .config({
      ttsStream: { enable: true },
      bargeIn: {
        enable: true,
        sticky: true,
        minBargeinWordCount: 1,
        actionHook: '/speech-detected',
        input: ['speech'],
      },
    })
    .say({ text: 'Hi there, how can I help you today?' })
    .send();
});

console.log('LLM streaming app listening on port 3000');
