import http from 'http';
import { createEndpoint } from '@jambonz/sdk/websocket';

const server = http.createServer();
const makeService = createEndpoint({ server, port: 3000 });

const svc = makeService({ path: '/' });

svc.on('session:new', (session) => {
  console.log(`Incoming call: ${session.callSid}`);

  session
    .say({ text: 'Hello! Welcome to our service. Thank you for calling. Goodbye!' })
    .hangup()
    .send();
});

console.log('jambonz ws app listening on port 3000');
