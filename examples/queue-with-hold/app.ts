import express from 'express';
import { WebhookResponse } from '@jambonz/sdk/webhook';

const app = express();
app.use(express.json());

// Caller arrives — greet and place in queue
app.post('/incoming', (_req, res) => {
  const jambonz = new WebhookResponse();
  jambonz
    .say({ text: 'Thank you for calling. All agents are currently busy. Please hold and we will be with you shortly.' })
    .enqueue({
      name: 'support',
      waitHook: '/hold-music',
      actionHook: '/queue-exit',
    });

  res.json(jambonz);
});

// Called periodically while the caller waits in the queue.
// Return verbs to play hold music and announce queue position.
app.post('/hold-music', (req, res) => {
  const { queuePosition, queueTime } = req.body;
  const minutes = Math.floor((queueTime || 0) / 60);

  const jambonz = new WebhookResponse();
  jambonz
    .say({ text: `You are number ${queuePosition || 'next'} in the queue. Approximate wait time: ${minutes || 'less than one'} minutes.` })
    .play({ url: 'https://example.com/sounds/hold-music.mp3', loop: 1 });

  res.json(jambonz);
});

// Called when the caller leaves the queue (dequeued or hung up)
app.post('/queue-exit', (req, res) => {
  console.log(`Caller left queue: ${JSON.stringify(req.body)}`);
  const jambonz = new WebhookResponse();
  jambonz.hangup();
  res.json(jambonz);
});

// Agent-facing endpoint — agent calls in and dequeues the next caller
app.post('/agent', (_req, res) => {
  const jambonz = new WebhookResponse();
  jambonz
    .say({ text: 'Connecting you to the next caller in the queue.' })
    .dequeue({
      name: 'support',
      timeout: 30,
      beep: true,
      actionHook: '/agent-call-end',
    })
    .say({ text: 'No callers are waiting in the queue. Goodbye.' })
    .hangup();

  res.json(jambonz);
});

// Called when the agent's bridged call ends
app.post('/agent-call-end', (req, res) => {
  console.log(`Agent call ended: ${JSON.stringify(req.body)}`);
  const jambonz = new WebhookResponse();
  jambonz.hangup();
  res.json(jambonz);
});

app.listen(3000, () => console.log('Queue app listening on port 3000'));
