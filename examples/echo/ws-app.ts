import http from 'http';
import { createEndpoint } from '@jambonz/sdk/websocket';

const server = http.createServer();
const makeService = createEndpoint({ server, port: 3000 });

const svc = makeService({ path: '/echo' });

svc.on('session:new', (session) => {
  console.log(`New incoming call: ${session.callSid}`);

  session
    .on('close', (code: number, _reason: Buffer) => {
      console.log(`Session ${session.callSid} closed: ${code}`);
    })
    .on('error', (err: Error) => {
      console.error(`Session ${session.callSid} error:`, err);
    })
    .on('/echo', (evt: Record<string, any>) => {
      console.log('Got speech event:', evt.reason);

      switch (evt.reason) {
        case 'speechDetected': {
          const { transcript, confidence } = evt.speech.alternatives[0];
          session
            .say({
              text: confidence
                ? `You said: ${transcript}. The confidence score was ${confidence.toFixed(2)}.`
                : `You said: ${transcript}.`,
            })
            .gather({
              input: ['speech'],
              actionHook: '/echo',
              timeout: 25,
              say: { text: 'Please say something else.' },
            })
            .reply();
          break;
        }
        case 'timeout':
          session
            .gather({
              input: ['speech'],
              actionHook: '/echo',
              timeout: 25,
              say: { text: 'Are you still there? I didn\'t hear anything.' },
            })
            .reply();
          break;
        default:
          session.reply();
          break;
      }
    });

  session
    .pause({ length: 1 })
    .gather({
      input: ['speech'],
      actionHook: '/echo',
      timeout: 25,
      say: { text: 'Please say something and I will echo it back to you.' },
    })
    .send();
});

console.log('Echo WebSocket app listening on port 3000');
