import express from 'express';
import { WebhookResponse } from '@jambonz/sdk/webhook';

const app = express();
app.use(express.json());

const SYSTEM_PROMPT = `You are a helpful customer service agent for Acme Corp.
You help customers with order inquiries, returns, and general questions.
Be concise and friendly. Keep responses under 2-3 sentences when possible.
If you need to look up an order, use the lookupOrder function.
If the customer wants to speak to a human, use the transferToAgent function.`;

// Initial call handler
app.post('/incoming', (_req, res) => {
  const jambonz = new WebhookResponse();
  jambonz
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
    .llm({
      vendor: 'openai',
      model: 'gpt-4o',
      auth: { apiKey: process.env.OPENAI_API_KEY! },
      llmOptions: {
        messages: [{ role: 'system', content: SYSTEM_PROMPT }],
        temperature: 0.7,
        tools: [
          {
            type: 'function',
            function: {
              name: 'lookupOrder',
              description: 'Look up an order by order number to get status, tracking, and details',
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
      toolHook: '/tool-call',
    });

  res.json(jambonz);
});

// Handle tool/function calls from the LLM
app.post('/tool-call', (req, res) => {
  const { name, args } = req.body.tool;

  switch (name) {
    case 'lookupOrder': {
      // In production, query your order database here
      const order = {
        orderNumber: args.orderNumber,
        status: 'shipped',
        trackingNumber: 'TRK-98765',
        estimatedDelivery: '2026-02-20',
      };
      res.json({ result: JSON.stringify(order) });
      break;
    }

    case 'transferToAgent': {
      const jambonz = new WebhookResponse();
      jambonz
        .say({ text: 'Let me connect you to a human agent. Please hold.' })
        .dial({
          target: [{ type: 'user', name: 'support-queue' }],
          answerOnBridge: true,
          timeout: 60,
          actionHook: '/dial-result',
        })
        .say({ text: 'Sorry, no agents are available. Please try again later.' })
        .hangup();
      res.json({ result: 'Transferring to agent', verbs: jambonz.toJSON() });
      break;
    }

    default:
      res.json({ result: 'Unknown tool' });
  }
});

// Handle LLM conversation end
app.post('/llm-complete', (req, res) => {
  console.log('LLM conversation ended:', req.body.reason);
  const jambonz = new WebhookResponse();
  jambonz
    .say({ text: 'Thank you for calling Acme Corp. Goodbye!' })
    .hangup();
  res.json(jambonz);
});

app.post('/dial-result', (_req, res) => {
  const jambonz = new WebhookResponse();
  jambonz.hangup();
  res.json(jambonz);
});

app.listen(3000, () => console.log('Voice agent listening on port 3000'));
