import express from 'express';
import { WebhookResponse } from '@jambonz/sdk/webhook';

const app = express();
app.use(express.json());

app.post('/record', (_req, res) => {
  const wsUrl = process.env.WS_RECORD_URL;
  if (!wsUrl) throw new Error('WS_RECORD_URL env variable is required');

  const jambonz = new WebhookResponse();
  jambonz
    .pause({ length: 1 })
    .say({
      text: 'Hi there. Please leave a message, and we will get back to you shortly.',
    })
    .listen({ url: wsUrl });

  res.json(jambonz);
});

app.listen(3000, () => console.log('Listen-record webhook app listening on port 3000'));
