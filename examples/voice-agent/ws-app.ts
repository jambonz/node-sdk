import http from 'http';
import { createEndpoint } from '@jambonz/sdk/websocket';

const server = http.createServer();
const makeService = createEndpoint({
  server,
  port: 3000,
  envVars: {
    OPENAI_API_KEY: {
      type: 'string',
      description: 'OpenAI API key',
      required: true,
      obscure: true,
    },
  },
});

const svc = makeService({ path: '/' });

const SYSTEM_PROMPT = `You are a helpful customer service agent for Acme Corp.
You help customers with order inquiries, returns, and general questions.
Be concise and friendly. Keep responses under 2-3 sentences when possible.
If you need to look up an order, use the lookupOrder function.
If the customer wants to speak to a human, use the transferToAgent function.`;

svc.on('session:new', (session) => {
  console.log(`Incoming call: ${session.callSid}`);

  const apiKey = session.data.env_vars?.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Set OPENAI_API_KEY in your jambonz application environment variables');

  session
    .config({
      synthesizer: {
        vendor: 'elevenlabs',
        voice: 'Rachel',
        language: 'en-US',
      },
      recognizer: {
        vendor: 'deepgram',
        language: 'en-US',
        deepgramOptions: { model: 'nova-2', smartFormatting: true },
      },
      fillerNoise: {
        enable: true,
        url: 'https://example.com/sounds/typing.wav',
        startDelaySecs: 2,
      },
    })
    .openai_s2s({
      model: 'gpt-4o',
      auth: { apiKey },
      llmOptions: {
        messages: [{ role: 'system', content: SYSTEM_PROMPT }],
        temperature: 0.7,
        tools: [
          {
            type: 'function',
            function: {
              name: 'lookupOrder',
              description: 'Look up an order by order number',
              parameters: {
                type: 'object',
                properties: {
                  orderNumber: { type: 'string', description: 'The order number (e.g. ORD-12345)' },
                },
                required: ['orderNumber'],
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'transferToAgent',
              description: 'Transfer the call to a human agent',
              parameters: {
                type: 'object',
                properties: {
                  reason: { type: 'string', description: 'Why the caller wants a human agent' },
                },
                required: ['reason'],
              },
            },
          },
        ],
      },
      actionHook: '/llm-complete',
    })
    .send();

  // Handle tool calls over the WebSocket
  session.on('llm:tool-call', (data: Record<string, unknown>) => {
    const tool = data.tool as { name: string; args: Record<string, string>; tool_call_id: string };

    switch (tool.name) {
      case 'lookupOrder': {
        const order = {
          orderNumber: tool.args.orderNumber,
          status: 'shipped',
          trackingNumber: 'TRK-98765',
          estimatedDelivery: '2026-02-20',
        };
        session.sendToolOutput(tool.tool_call_id, { result: JSON.stringify(order) });
        break;
      }

      case 'transferToAgent': {
        session.sendToolOutput(tool.tool_call_id, { result: 'Transferring to agent' });
        session
          .say({ text: 'Let me connect you to a human agent. Please hold.' })
          .dial({
            target: [{ type: 'user', name: 'support-queue' }],
            answerOnBridge: true,
            timeout: 60,
          })
          .say({ text: 'Sorry, no agents are available. Please try again later.' })
          .hangup()
          .send();
        break;
      }

      default:
        session.sendToolOutput(tool.tool_call_id, { result: 'Unknown tool' });
    }
  });

  // Handle LLM conversation end
  session.on('/llm-complete', (data: Record<string, unknown>) => {
    console.log('LLM conversation ended:', data.reason);
    session
      .say({ text: 'Thank you for calling Acme Corp. Goodbye!' })
      .hangup()
      .reply();
  });
});

console.log('Voice agent ws app listening on port 3000');
