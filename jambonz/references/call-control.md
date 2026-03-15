# Call Control

This reference covers dial, SIP operations, call queuing, conference, mid-call control, and recording.

## Dial (Call Bridging)

The `dial` verb places an outbound call and bridges it to the current caller.

### Target Types

The `target` array specifies who to call. Each target has a `type`:

- `phone` — PSTN number: `{ "type": "phone", "number": "+15085551212" }`
- `sip` — SIP URI: `{ "type": "sip", "sipUri": "sip:user@example.com" }`
- `user` — Registered jambonz user: `{ "type": "user", "name": "agent-1" }`
- `teams` — Microsoft Teams user: `{ "type": "teams", "user": "user@company.com" }`

Multiple targets can be specified for simultaneous ring (first to answer wins):

```json
{
  "verb": "dial",
  "target": [
    { "type": "phone", "number": "+15085551212" },
    { "type": "phone", "number": "+15085551213" }
  ],
  "timeout": 30,
  "answerOnBridge": true,
  "actionHook": "/dial-result"
}
```

### Key Properties

- `answerOnBridge` — If `true`, the inbound call is answered only when the outbound leg connects. Use this for natural call flow where the caller hears ringing until someone picks up.
- `timeout` — Seconds to wait for answer before giving up.
- `actionHook` — Fires when the dial completes (answered, no-answer, busy, failed).
- `dtmfCapture` — Capture DTMF from the caller during the bridged call.
- `anchorMedia` — Set to `true` if you need recording during the bridged call.

### Dial ActionHook Result

| Field | Values |
|-------|--------|
| `dial_call_status` | `completed`, `failed`, `busy`, `no-answer` |
| `dial_sip_status` | SIP response code (e.g. `200`, `486`, `487`) |
| `duration` | Call duration in seconds |

Look up full schema: `get_jambonz_schema('dial')`

## SIP Operations

### sip-decline — Reject an incoming call

```json
{ "verb": "sip:decline", "status": 486, "reason": "Busy Here" }
```

Common status codes: `404` (Not Found), `486` (Busy), `503` (Service Unavailable).

### sip-refer — Blind SIP Transfer

```json
{ "verb": "sip:refer", "referTo": "sip:destination@example.com" }
```

Transfers the call to another SIP endpoint. The original call leg is released.

### sip-request — Send SIP Request

Send a SIP INFO, NOTIFY, or other request within the dialog.

Look up schemas: `get_jambonz_schema('sip-decline')`, `get_jambonz_schema('sip-refer')`, `get_jambonz_schema('sip-request')`

## Call Queuing

### Enqueue (put caller in queue)

```json
{
  "verb": "enqueue",
  "name": "support",
  "waitHook": "/hold-music",
  "actionHook": "/queue-exit"
}
```

- `name` — queue name (string)
- `waitHook` — invoked while caller waits; return verbs for hold music/announcements
- `actionHook` — fires when caller leaves queue (dequeued, hangup, or error)

The `waitHook` is called periodically. Return `say` or `play` verbs for hold music. Return an empty array to keep waiting silently.

### Dequeue (agent picks up)

```json
{
  "verb": "dequeue",
  "name": "support",
  "timeout": 60,
  "actionHook": "/dequeue-result"
}
```

The dequeue verb is used in the **agent's** application (not the caller's). It bridges the agent to the next caller in the named queue.

### Queue Result

The actionHook payload includes `queue_result`:
- `bridged` — caller and agent connected
- `timeout` — no caller available within timeout
- `hangup` — caller hung up while in queue

### WebSocket Queue Example

```typescript
// Caller app
svc.on('session:new', (session) => {
  session.on('/queue-exit', (evt) => {
    session.say({ text: 'Thank you for waiting. Goodbye.' }).hangup().reply();
  });
  session.on('/hold-music', (evt) => {
    session.play({ url: 'https://example.com/hold-music.mp3' }).reply();
  });

  session
    .say({ text: 'All agents are busy. Please hold.' })
    .enqueue({ name: 'support', waitHook: '/hold-music', actionHook: '/queue-exit' })
    .send();
});

// Agent app (separate service or path)
agentSvc.on('session:new', (session) => {
  session.on('/dequeue-result', (evt) => {
    if (evt.queue_result === 'bridged') {
      session.say({ text: 'The caller has disconnected.' }).hangup().reply();
    } else {
      session.say({ text: 'No callers in queue.' }).hangup().reply();
    }
  });

  session
    .dequeue({ name: 'support', timeout: 60, actionHook: '/dequeue-result' })
    .send();
});
```

## Conference

The `conference` verb creates or joins a multi-party conference room.

```json
{
  "verb": "conference",
  "name": "team-standup",
  "actionHook": "/conference-exit",
  "beep": true,
  "startConferenceOnEnter": true,
  "endConferenceOnExit": false
}
```

Look up full schema: `get_jambonz_schema('conference')`

## Mid-Call Control

### REST API (for Webhook Apps)

Use `JambonzClient` from `@jambonz/sdk/client` to control active calls:

```typescript
import { JambonzClient } from '@jambonz/sdk/client';
const client = new JambonzClient({ baseUrl, accountSid, apiKey });

// Whisper a verb to the caller
await client.calls.whisper(callSid, { verb: 'say', text: 'You have 5 minutes.' });

// Mute/unmute
await client.calls.mute(callSid, 'mute');
await client.calls.mute(callSid, 'unmute');

// Redirect to a new webhook
await client.calls.redirect(callSid, 'https://example.com/new-flow');

// Hang up
await client.calls.update(callSid, { call_status: 'completed' });

// Pause/resume transcription
await client.calls.update(callSid, { transcribe_status: 'pause' });
```

### Inject Commands (for WebSocket Apps)

WebSocket sessions can inject commands for immediate execution without replacing the verb stack:

```typescript
// Recording (SIPREC)
session.injectRecord('startCallRecording', { siprecServerURL: 'sip:recorder@example.com' });
session.injectRecord('pauseCallRecording');
session.injectRecord('resumeCallRecording');
session.injectRecord('stopCallRecording');

// Whisper
session.injectWhisper({ verb: 'say', text: 'You have 5 minutes remaining.' });

// Mute/unmute
session.injectMute('mute');
session.injectMute('unmute');

// Pause/resume audio streaming
session.injectListenStatus('pause');

// Send DTMF
session.injectDtmf('1');

// Tag with metadata
session.injectTag({ supervisor: 'jane', priority: 'high' });

// Generic command
session.injectCommand('redirect', { call_hook: '/new-flow' });
```

## Recording (SIPREC)

jambonz supports SIPREC-based call recording. Key points:

1. Recording is controlled mid-call via inject commands (WebSocket) or REST API (webhook)
2. **`anchorMedia: true` is required on `dial`** for recording during bridged calls — without it, audio flows peer-to-peer and doesn't pass through the media server
3. Recording starts/stops dynamically — you don't configure it as a verb in the initial verb array

### Start Recording

```typescript
// WebSocket
session.injectRecord('startCallRecording', {
  siprecServerURL: 'sip:recorder@example.com',
  recordingID: 'call-123',  // optional identifier
});

// REST API
await client.calls.update(callSid, {
  sip_rec: {
    action: 'startCallRecording',
    siprecServerURL: 'sip:recorder@example.com',
  },
});
```

### Pause / Resume / Stop

```typescript
session.injectRecord('pauseCallRecording');
session.injectRecord('resumeCallRecording');
session.injectRecord('stopCallRecording');
```
