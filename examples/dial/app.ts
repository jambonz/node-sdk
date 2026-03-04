import express from 'express';
import { WebhookResponse } from '@jambonz/sdk/webhook';

const app = express();
app.use(express.json());

app.post('/dial', (_req, res) => {
  const jambonz = new WebhookResponse();
  jambonz.dial({
    answerOnBridge: true,
    target: [
      {
        type: 'phone',
        number: process.env.OUTDIAL_NUMBER || '13034997111',
      },
    ],
  });

  res.json(jambonz);
});

app.listen(3000, () => console.log('Dial webhook app listening on port 3000'));
