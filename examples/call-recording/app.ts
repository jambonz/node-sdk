import express from 'express';
import { WebhookResponse } from '@jambonz/sdk/webhook';
import { JambonzClient } from '@jambonz/sdk/client';

const app = express();
app.use(express.json());

// REST client for mid-call control
const client = new JambonzClient({
  baseUrl: process.env.JAMBONZ_BASE_URL || 'https://api.jambonz.us',
  accountSid: process.env.JAMBONZ_ACCOUNT_SID || '',
  apiKey: process.env.JAMBONZ_API_KEY || '',
});

// Incoming call — bridge to an agent with media anchored for recording
app.post('/incoming', (_req, res) => {
  const jambonz = new WebhookResponse();
  jambonz
    .say({ text: 'This call may be recorded for quality assurance.' })
    .dial({
      target: [{ type: 'phone', number: process.env.AGENT_NUMBER || '+15085551212' }],
      answerOnBridge: true,
      anchorMedia: true, // required for mid-call recording
      timeout: 30,
      actionHook: '/call-ended',
    })
    .say({ text: 'The agent is unavailable. Goodbye.' })
    .hangup();

  res.json(jambonz);
});

// Called when the bridged call ends
app.post('/call-ended', (req, res) => {
  console.log(`Call ended: ${JSON.stringify(req.body)}`);
  const jambonz = new WebhookResponse();
  jambonz.hangup();
  res.json(jambonz);
});

// External API endpoint — start recording on an active call
// Call this from your admin UI or monitoring system
app.post('/api/start-recording', async (req, res) => {
  const { callSid } = req.body;
  try {
    // Whisper a notification to the caller
    await client.calls.whisper(callSid, {
      verb: 'say',
      text: 'Recording has started.',
    });
    res.json({ status: 'recording started' });
  } catch (err) {
    console.error('Failed to start recording:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// External API endpoint — mute/unmute an active call
app.post('/api/mute', async (req, res) => {
  const { callSid, status } = req.body;
  try {
    await client.calls.mute(callSid, status);
    res.json({ status: `call ${status}d` });
  } catch (err) {
    console.error('Failed to mute:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.listen(3000, () => console.log('Recording app listening on port 3000'));
