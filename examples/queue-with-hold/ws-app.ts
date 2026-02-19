import http from 'http';
import { createEndpoint } from '@jambonz/sdk/websocket';

const server = http.createServer();
const makeService = createEndpoint({ server, port: 3000 });

// Caller-facing service — place callers in the support queue
const callerSvc = makeService({ path: '/incoming' });

callerSvc.on('session:new', (session) => {
  console.log(`Caller ${session.callSid} entering queue`);

  session
    .say({ text: 'Thank you for calling. All agents are currently busy. Please hold.' })
    .enqueue({
      name: 'support',
      waitHook: '/hold-music',
      actionHook: '/queue-exit',
    })
    .send();
});

// Agent-facing service — agent connects and dequeues the next caller
const agentSvc = makeService({ path: '/agent' });

agentSvc.on('session:new', (session) => {
  console.log(`Agent ${session.callSid} ready to take a call`);

  session
    .say({ text: 'Connecting you to the next caller.' })
    .dequeue({
      name: 'support',
      timeout: 30,
      beep: true,
    })
    .say({ text: 'No callers waiting. Goodbye.' })
    .hangup()
    .send();
});

console.log('Queue ws app listening on port 3000');
