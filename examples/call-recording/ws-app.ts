import http from 'http';
import { createEndpoint } from '@jambonz/sdk/websocket';

const server = http.createServer();
const makeService = createEndpoint({ server, port: 3000 });

const svc = makeService({ path: '/' });

svc.on('session:new', (session) => {
  console.log(`Call ${session.callSid} connected`);

  // Bridge to an agent with media anchored for recording
  session
    .say({ text: 'This call may be recorded for quality assurance.' })
    .dial({
      target: [{ type: 'phone', number: process.env.AGENT_NUMBER || '+15085551212' }],
      answerOnBridge: true,
      anchorMedia: true,
      timeout: 30,
    })
    .send();

  // Start recording after a short delay (e.g., triggered by external event)
  // In practice, you'd trigger this from a supervisor UI or event handler
  setTimeout(() => {
    console.log(`Starting recording on ${session.callSid}`);
    session.injectRecord('startCallRecording', {
      siprecServerURL: process.env.SIPREC_URL || 'sip:recorder@example.com',
    });
  }, 5000);

  // Stop recording after 60 seconds (example — in practice, triggered externally)
  setTimeout(() => {
    console.log(`Stopping recording on ${session.callSid}`);
    session.injectRecord('stopCallRecording');
  }, 65000);

  session.on('verb:status', (data) => {
    console.log(`Verb status: ${JSON.stringify(data)}`);
  });

  session.on('call:status', (data) => {
    console.log(`Call status: ${JSON.stringify(data)}`);
  });
});

console.log('Recording ws app listening on port 3000');
