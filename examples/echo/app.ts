import express from 'express';
import { WebhookResponse } from '@jambonz/sdk/webhook';

const app = express();
app.use(express.json());

app.post('/echo', (_req, res) => {
  const jambonz = new WebhookResponse();
  jambonz
    .pause({ length: 1 })
    .gather({
      input: ['speech'],
      actionHook: '/echo-result',
      timeout: 25,
      say: { text: 'Please say something and I will echo it back to you.' },
    })
    .say({ text: 'I didn\'t hear anything. Goodbye.' })
    .hangup();

  res.json(jambonz);
});

app.post('/echo-result', (req, res) => {
  const { reason, speech } = req.body;
  const jambonz = new WebhookResponse();

  switch (reason) {
    case 'speechDetected': {
      const { transcript, confidence } = speech.alternatives[0];
      jambonz
        .say({
          text: confidence
            ? `You said: ${transcript}. The confidence score was ${confidence.toFixed(2)}.`
            : `You said: ${transcript}.`,
        })
        .gather({
          input: ['speech'],
          actionHook: '/echo-result',
          timeout: 25,
          say: { text: 'Please say something else.' },
        })
        .say({ text: 'I didn\'t hear anything. Goodbye.' })
        .hangup();
      break;
    }
    case 'timeout':
      jambonz
        .gather({
          input: ['speech'],
          actionHook: '/echo-result',
          timeout: 25,
          say: { text: 'Are you still there? I didn\'t hear anything.' },
        })
        .say({ text: 'I didn\'t hear anything. Goodbye.' })
        .hangup();
      break;
    default:
      jambonz.hangup();
      break;
  }

  res.json(jambonz);
});

app.listen(3000, () => console.log('Echo webhook app listening on port 3000'));
