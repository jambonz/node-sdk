const express = require('express');
const app = express();
app.use(express.json());

const SYSTEM_PROMPT = `You are a helpful customer service agent for Acme Corp.
You help customers with order inquiries, returns, and general questions.
Be concise and friendly. Keep responses under 2-3 sentences when possible.
If you need to look up an order, use the lookupOrder function.
If the customer wants to speak to a human, use the transferToAgent function.`;

// Initial call handler
app.post('/incoming', (req, res) => {
  res.json([
    {
      verb: 'config',
      synthesizer: {
        vendor: 'elevenlabs',
        voice: 'Rachel',
        language: 'en-US'
      },
      recognizer: {
        vendor: 'deepgram',
        language: 'en-US',
        deepgramOptions: { model: 'nova-2', smartFormatting: true }
      },
      fillerNoise: {
        enable: true,
        url: 'https://example.com/sounds/typing.wav',
        startDelaySecs: 2
      }
    },
    {
      verb: 'openai_s2s',
      model: 'gpt-4o',
      auth: { apiKey: process.env.OPENAI_API_KEY },
      llmOptions: {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT }
        ],
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
                  orderNumber: { type: 'string', description: 'The order number (e.g. ORD-12345)' }
                },
                required: ['orderNumber']
              }
            }
          },
          {
            type: 'function',
            function: {
              name: 'transferToAgent',
              description: 'Transfer the call to a human agent',
              parameters: {
                type: 'object',
                properties: {
                  reason: { type: 'string', description: 'Why the caller wants a human agent' }
                },
                required: ['reason']
              }
            }
          }
        ]
      },
      actionHook: '/llm-complete',
      toolHook: '/tool-call'
    }
  ]);
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
        estimatedDelivery: '2026-02-20'
      };
      res.json({ result: JSON.stringify(order) });
      break;
    }

    case 'transferToAgent': {
      // Return verbs to transfer the call
      res.json({
        result: 'Transferring to agent',
        verbs: [
          { verb: 'say', text: 'Let me connect you to a human agent. Please hold.' },
          {
            verb: 'dial',
            target: [{ type: 'user', name: 'support-queue' }],
            answerOnBridge: true,
            timeout: 60,
            actionHook: '/dial-result'
          },
          { verb: 'say', text: 'Sorry, no agents are available. Please try again later.' },
          { verb: 'hangup' }
        ]
      });
      break;
    }

    default:
      res.json({ result: 'Unknown tool' });
  }
});

// Handle LLM conversation end
app.post('/llm-complete', (req, res) => {
  console.log('LLM conversation ended:', req.body.reason);
  res.json([
    { verb: 'say', text: 'Thank you for calling Acme Corp. Goodbye!' },
    { verb: 'hangup' }
  ]);
});

app.post('/dial-result', (req, res) => {
  res.json([{ verb: 'hangup' }]);
});

app.listen(3000, () => console.log('Voice agent listening on port 3000'));
