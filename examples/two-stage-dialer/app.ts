/**
 * Staged dialer — prompts the caller to enter a phone number via DTMF,
 * dials it, and plays a whisper warning before the call time limit expires.
 *
 * Flow:
 *   1. Answer and gather DTMF digits (phone number with country code, # to finish)
 *   2. Dial the entered number with a 20-second time limit
 *   3. At 10 seconds, whisper to the caller that the call ends in 10 seconds
 *   4. At 20 seconds the dial verb auto-disconnects
 */
import http from 'http';
import { createEndpoint } from '@jambonz/sdk/websocket';

const port = Number(process.env.PORT) || 3000;
const server = http.createServer();
const makeService = createEndpoint({ server, port });

const svc = makeService({ path: '/' });

svc.on('session:new', (session) => {
  const log = (msg: string) => console.log(`[${session.callSid}] ${msg}`);
  log('new call');

  let whisperTimer: ReturnType<typeof setTimeout> | null = null;

  // Gather result — caller entered a phone number
  session.on('/gather', (evt: Record<string, any>) => {
    const digits = evt.digits as string | undefined;

    if (!digits) {
      log('no digits entered, reprompting');
      session
        .gather({
          actionHook: '/gather',
          input: ['digits'],
          finishOnKey: '#',
          timeout: 15,
          say: { text: 'Sorry, I didn\'t get that. Please enter the phone number followed by the pound key.' },
        })
        .hangup()
        .reply();
      return;
    }

    const number = digits.startsWith('+') ? digits : `+${digits}`;
    log(`dialing ${number}`);

    // Start a timer to whisper 10 seconds into the call
    whisperTimer = setTimeout(() => {
      log('whispering time warning');
      session.injectWhisper({ verb: 'say', text: 'Your call will end in 10 seconds.' });
    }, 10_000);

    session
      .dial({
        target: [{ type: 'phone', number }],
        answerOnBridge: true,
        timeout: 30,
        timeLimit: 20,
        actionHook: '/dial-complete',
      })
      .hangup()
      .reply();
  });

  // Dial complete — call ended (time limit, hangup, or no answer)
  session.on('/dial-complete', (evt: Record<string, any>) => {
    if (whisperTimer) clearTimeout(whisperTimer);
    log(`dial ended: ${evt.dial_call_status || 'unknown'}`);
    session
      .say({ text: 'Your call has ended. Goodbye.' })
      .hangup()
      .reply();
  });

  session.on('close', (code: number) => {
    if (whisperTimer) clearTimeout(whisperTimer);
    log(`closed (${code})`);
  });
  session.on('error', (err: Error) => console.error(`[${session.callSid}] error:`, err));

  // Initial verb sequence — answer and gather digits
  session
    .answer()
    .gather({
      actionHook: '/gather',
      input: ['digits'],
      finishOnKey: '#',
      timeout: 15,
      say: { text: 'Please enter the phone number starting with country code, followed by the pound key.' },
    })
    .hangup()
    .send();
});

console.log(`Staged dialer listening on port ${port}`);
