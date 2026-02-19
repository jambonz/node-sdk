import express from 'express';
import { WebhookResponse } from '@jambonz/sdk/webhook';

const app = express();
app.use(express.json());

// Initial call handler — present the menu
app.post('/incoming', (_req, res) => {
  const jambonz = new WebhookResponse();
  jambonz
    .gather({
      input: ['speech', 'digits'],
      actionHook: '/menu-selection',
      numDigits: 1,
      timeout: 10,
      say: {
        text: 'Welcome to Acme Corp. Press 1 or say sales for sales. Press 2 or say support for technical support. Press 3 or say billing for billing.',
      },
    })
    .say({ text: 'We did not receive any input. Goodbye.' })
    .hangup();

  res.json(jambonz);
});

// Handle the menu selection
app.post('/menu-selection', (req, res) => {
  const { digits, speech } = req.body;
  const transcript: string = speech?.alternatives?.[0]?.transcript?.toLowerCase() || '';

  let department: string | undefined;
  if (digits === '1' || transcript.includes('sales')) {
    department = 'sales';
  } else if (digits === '2' || transcript.includes('support')) {
    department = 'support';
  } else if (digits === '3' || transcript.includes('billing')) {
    department = 'billing';
  }

  const jambonz = new WebhookResponse();

  if (department) {
    jambonz
      .say({ text: `Connecting you to ${department}. Please hold.` })
      .dial({
        target: [{ type: 'user', name: `${department}-queue` }],
        answerOnBridge: true,
        timeout: 30,
        actionHook: '/dial-result',
      })
      .say({ text: `Sorry, ${department} is not available right now. Please try again later.` })
      .hangup();
  } else {
    jambonz
      .say({ text: "Sorry, I didn't understand that." })
      .redirect({ actionHook: '/incoming' });
  }

  res.json(jambonz);
});

// Handle dial result
app.post('/dial-result', (req, res) => {
  console.log(`Call ended: ${JSON.stringify(req.body)}`);
  const jambonz = new WebhookResponse();
  jambonz.hangup();
  res.json(jambonz);
});

app.listen(3000, () => console.log('IVR app listening on port 3000'));
