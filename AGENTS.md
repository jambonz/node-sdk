# jambonz Agent Toolkit

jambonz is an open-source CPaaS (Communications Platform as a Service) for building voice and messaging applications. It handles telephony infrastructure — SIP, carriers, phone numbers, media processing — so you can focus on application logic.

## How jambonz Applications Work

A jambonz application controls phone calls by returning **arrays of verbs** — JSON instructions that execute sequentially. The runtime processes each verb in order: speak text, play audio, collect input, dial a number, connect to an AI model, etc.

### The Webhook Lifecycle

1. An incoming call arrives. jambonz invokes your application's URL with call details (caller, called number, SIP headers, etc.).
2. Your application returns a JSON array of verbs.
3. jambonz executes the verbs in order.
4. When a verb with an `actionHook` completes (e.g. `gather` collects speech input), jambonz invokes the actionHook URL with the result.
5. The actionHook response (a new verb array) replaces the remaining verb stack.
6. This continues until the call ends or a `hangup` verb is executed.

### Transport Modes

jambonz supports two transport modes for delivering verb arrays:

- **Webhook (HTTP)**: Your server receives HTTP POST requests with call data and returns JSON verb arrays in the response body. Stateless and simple. Good for IVR menus, call routing, and straightforward flows.
- **WebSocket**: Your server maintains a persistent websocket connection with jambonz. Verb arrays are sent as JSON messages in both directions. Required for real-time features like LLM conversations, audio streaming, and event-driven flows.

The verb schemas and JSON structure are identical in both modes. The difference is the transport.

### When to Use Which

- **Webhook**: Simple IVR, call routing, voicemail, basic gather-and-respond patterns.
- **WebSocket**: LLM-powered voice agents, real-time audio streaming, complex conversational flows, anything requiring bidirectional communication, or asynchronous logic, or streaming tts.

## Schema

The complete verb schema is at `schema/jambonz-app.schema.json`. This is a JSON Schema (draft 2020-12) that defines the structure of a jambonz application.

Individual verb schemas are in `schema/verbs/`. Shared component types (synthesizer, recognizer, target, etc.) are in `schema/components/`.

## Core Verbs

### Audio & Speech
- **say** — Speak text using TTS. Supports SSML, streaming, multiple voices.
- **play** — Play an audio file from a URL.
- **gather** — Collect speech (STT) and/or DTMF input. The workhorse for interactive menus and voice input.

### AI & Real-time
- **openai_s2s** / **google_s2s** / **elevenlabs_s2s** / **deepgram_s2s** / **ultravox_s2s** — Connect the caller to a vendor-specific LLM for real-time voice conversation. These are the **preferred** verbs when the vendor is known. Each handles the full STT→LLM→TTS pipeline with the vendor pre-set.
- **s2s** — Generic LLM voice conversation verb. Use only when the vendor is determined at runtime (e.g. from an env var). Requires `vendor` to be specified.
- **pipeline** — Higher-level voice AI pipeline with integrated turn detection.
- **dialogflow** — Connect the caller to a Google Dialogflow agent (ES, CX, or CES).
- **stream** — Stream raw audio to a websocket endpoint for custom processing.
- **transcribe** — Real-time call transcription sent to a webhook.

### Call Control
- **dial** — Place an outbound call and bridge it to the current caller.
- **conference** — Multi-party conference room.
- **enqueue** / **dequeue** — Call queuing.
- **hangup** — End the call.
- **redirect** — Transfer control to a different webhook.
- **pause** — Wait for a specified duration.

### SIP
- **sip:decline** — Reject an incoming call with a SIP error.
- **sip:request** — Send a SIP request within the dialog.
- **sip:refer** — Transfer the call via SIP REFER.

### Utility
- **config** — Set session-level defaults (TTS vendor/voice, STT vendor, VAD, etc.).
- **tag** — Attach metadata to the call.
- **dtmf** — Send DTMF tones.
- **dub** — Mix auxiliary audio tracks into the call.
- **message** — Send SMS/MMS.
- **alert** — Send a SIP 180 with Alert-Info.
- **answer** — Explicitly answer the call.
- **leave** — Leave a conference or queue.

### Verb Synonyms and Shortcuts

**IMPORTANT — Code generation rules:**

1. **Always use `stream`, never `listen`** — they are synonyms; `stream` is the preferred name.
2. **Always use the vendor-specific shortcut when the LLM vendor is known** — use `openai_s2s`, `google_s2s`, `elevenlabs_s2s`, `deepgram_s2s`, or `ultravox_s2s`. Do NOT use `llm` or `s2s` with a `vendor` property when a shortcut exists.
3. **Use `s2s` (not `llm`) when the vendor is dynamic** — e.g. the vendor comes from an env var or runtime config. Both `s2s` and `llm` are synonyms, but prefer `s2s`.
4. **Never use `llm` in generated code** — it is a legacy name. Use either a vendor shortcut or `s2s`.

The same rules apply to SDK method calls: use `.openai_s2s(opts)`, `.deepgram_s2s(opts)`, etc. instead of `.llm({ vendor: 'openai', ... })`. Use `.stream(opts)` instead of `.listen(opts)`.

## Using the @jambonz/sdk

**IMPORTANT**: Always use the `@jambonz/sdk` package (version 0.1.x+) to build jambonz applications. The older packages `@jambonz/node-client-ws` and `@jambonz/node-client` are **deprecated and replaced** by `@jambonz/sdk`. Do NOT use those old packages. Do NOT build apps with raw JSON verb arrays and plain Express/WS — use `@jambonz/sdk`.

**IMPORTANT — App Environment Variables vs process.env**: jambonz applications should NEVER use `process.env` for application-configurable values (phone numbers, API keys, language preferences, greeting text, etc.). Instead, use **jambonz application environment variables** — a two-step pattern:
1. **Declare** the variables so the jambonz portal can discover them (via `envVars` option for WebSocket, or `envVarsMiddleware` for webhook).
2. **Read** the values at runtime from the call payload (`session.data.env_vars` for WebSocket, `req.body.env_vars` for webhook).

Both steps are required. Declaring without reading means values are ignored. Reading without declaring means the portal won't know about them and won't send them. See the [Application Environment Variables](#application-environment-variables) section for full details.

Install: `npm install @jambonz/sdk`

**Dependencies**: Webhook apps also require `express` (`npm install express`). WebSocket apps have no additional dependencies — the SDK includes `ws` internally. When generating a `package.json`, always include all required dependencies.

### Webhook Application (HTTP)

Import `WebhookResponse` from `@jambonz/sdk/webhook`. Create an Express server, construct a `WebhookResponse` for each request, chain verb methods, and return it via `res.json()`.

**Best practice**: Always include a `POST /call-status` handler. jambonz sends call status change notifications (ringing, in-progress, completed, etc.) to this endpoint. The handler should log the event and return 200. The path `/call-status` is conventional but the user may choose a different path:

```typescript
app.post('/call-status', (req, res) => {
  console.log(`Call ${req.body.call_sid} status: ${req.body.call_status}`);
  res.sendStatus(200);
});
```

```typescript
import express from 'express';
import { WebhookResponse } from '@jambonz/sdk/webhook';

const app = express();
app.use(express.json());

app.post('/incoming', (req, res) => {
  const jambonz = new WebhookResponse();
  jambonz
    .say({ text: 'Hello! Welcome to our service.' })
    .gather({
      input: ['speech', 'digits'],
      actionHook: '/handle-input',
      numDigits: 1,
      timeout: 10,
      say: { text: 'Press 1 for sales or 2 for support.' },
    })
    .say({ text: 'We did not receive any input. Goodbye.' })
    .hangup();

  res.json(jambonz);
});

app.post('/handle-input', (req, res) => {
  const { digits, speech } = req.body;
  const jambonz = new WebhookResponse();
  jambonz.say({ text: `You pressed ${digits || 'nothing'}. Goodbye.` }).hangup();
  res.json(jambonz);
});

// Every webhook app must handle call status events
app.post('/call-status', (req, res) => {
  console.log(`Call ${req.body.call_sid} status: ${req.body.call_status}`);
  res.sendStatus(200);
});

app.listen(3000, () => console.log('Listening on port 3000'));
```

### WebSocket Application

Import `createEndpoint` from `@jambonz/sdk/websocket`. Create an HTTP server, call `createEndpoint` to set up WebSocket handling, then register path-based services that receive `session` objects.

```typescript
import http from 'http';
import { createEndpoint } from '@jambonz/sdk/websocket';

const server = http.createServer();
const makeService = createEndpoint({ server, port: 3000 });

const svc = makeService({ path: '/' });

svc.on('session:new', (session) => {
  console.log(`Incoming call: ${session.callSid}`);

  session
    .say({ text: 'Hello from jambonz over WebSocket!' })
    .hangup()
    .send();
});

console.log('jambonz ws app listening on port 3000');
```

**Key differences from webhook**: Use `session` instead of `WebhookResponse`. Chain verbs the same way, but call `.send()` at the end to transmit the initial verb array over the WebSocket.

### WebSocket actionHook Events (CRITICAL)

In webhook mode, an `actionHook` is just a URL that jambonz POSTs to. In WebSocket mode, the `actionHook` value becomes an **event name** emitted on the session. You MUST bind a handler for it and respond with `.reply()`.

**Key rules for WebSocket actionHook handling:**
1. Use `session.on('/hookName', (evt) => {...})` to listen for the actionHook event.
2. The `evt` object contains the actionHook payload (same fields as the webhook POST body: `reason`, `speech`, `digits`, etc.).
3. Respond with `.reply()` — NOT `.send()`. `.send()` is only for the initial verb array (the first response to `session:new`). `.reply()` acknowledges the actionHook and provides the next verb array.
4. If no listener is bound for an actionHook, the SDK auto-replies with an empty verb array.

### WebSocket with Gather (speech echo example)

```typescript
import http from 'http';
import { createEndpoint } from '@jambonz/sdk/websocket';

const server = http.createServer();
const makeService = createEndpoint({ server, port: 3000 });

const svc = makeService({ path: '/' });

svc.on('session:new', (session) => {
  // Bind actionHook handler BEFORE sending verbs
  session
    .on('close', (code: number, _reason: Buffer) => {
      console.log(`Session ${session.callSid} closed: ${code}`);
    })
    .on('error', (err: Error) => {
      console.error(`Session ${session.callSid} error:`, err);
    })
    .on('/echo', (evt: Record<string, any>) => {
      // This fires when the gather verb completes (actionHook: '/echo')
      switch (evt.reason) {
        case 'speechDetected': {
          const transcript = evt.speech?.alternatives?.[0]?.transcript || 'nothing';
          session
            .say({ text: `You said: ${transcript}.` })
            .gather({
              input: ['speech'],
              actionHook: '/echo',
              timeout: 10,
              say: { text: 'Please say something else.' },
            })
            .reply();  // reply() — NOT send()
          break;
        }
        case 'timeout':
          session
            .gather({
              input: ['speech'],
              actionHook: '/echo',
              timeout: 10,
              say: { text: 'Are you still there? I didn\'t hear anything.' },
            })
            .reply();
          break;
        default:
          session.reply();
          break;
      }
    });

  // Send initial verbs to jambonz
  session
    .pause({ length: 1 })
    .gather({
      input: ['speech'],
      actionHook: '/echo',
      timeout: 10,
      say: { text: 'Please say something and I will echo it back to you.' },
    })
    .send();  // send() — first response only
});

console.log('Speech echo WebSocket app listening on port 3000');
```

**`.send()` vs `.reply()`:**
- `.send()` — Use ONCE for the initial verb array in response to `session:new`. This acknowledges the session.
- `.reply()` — Use for ALL subsequent responses (actionHook events, session:redirect). This acknowledges the hook message and provides the next verb array.

### SDK Verb Method Reference

Both `WebhookResponse` and `Session` support the same chainable verb methods:

`.say(opts)` `.play(opts)` `.gather(opts)` `.dial(opts)` `.llm(opts)` `.s2s(opts)` `.openai_s2s(opts)` `.google_s2s(opts)` `.elevenlabs_s2s(opts)` `.deepgram_s2s(opts)` `.ultravox_s2s(opts)` `.dialogflow(opts)` `.conference(opts)` `.enqueue(opts)` `.dequeue(opts)` `.hangup()` `.pause(opts)` `.redirect(opts)` `.config(opts)` `.tag(opts)` `.dtmf(opts)` `.listen(opts)` `.transcribe(opts)` `.message(opts)` `.stream(opts)` `.pipeline(opts)` `.dub(opts)` `.alert(opts)` `.answer(opts)` `.leave()` `.sipDecline(opts)` `.sipRefer(opts)` `.sipRequest(opts)`

All methods accept the same options as the corresponding verb JSON Schema. Methods are chainable — they return `this`.

### REST API Client

```typescript
import { JambonzClient } from '@jambonz/sdk/client';

const client = new JambonzClient({ baseUrl: 'https://api.jambonz.us', accountSid, apiKey });

// Create an outbound call
await client.calls.create({ from: '+15085551212', to: { type: 'phone', number: '+15085551213' }, call_hook: '/incoming' });

// Mid-call control
await client.calls.whisper(callSid, { verb: 'say', text: 'Supervisor listening.' });
await client.calls.mute(callSid, 'mute');
await client.calls.redirect(callSid, 'https://example.com/new-flow');
await client.calls.update(callSid, { call_status: 'completed' });
```

## Common Patterns (Raw JSON)

These are the raw JSON verb arrays that the SDK generates. You should use the SDK verb methods above, but these show the underlying structure for reference.

### Simple Greeting and Gather
```json
[
  { "verb": "say", "text": "Welcome. Press 1 for sales, 2 for support." },
  { "verb": "gather", "input": ["digits"], "numDigits": 1, "actionHook": "/menu" }
]
```

### LLM Voice Agent
```json
[
  {
    "verb": "config",
    "synthesizer": { "vendor": "elevenlabs", "voice": "Rachel" },
    "recognizer": { "vendor": "deepgram", "language": "en-US" }
  },
  {
    "verb": "openai_s2s",
    "model": "gpt-4o",
    "llmOptions": {
      "messages": [{ "role": "system", "content": "You are a helpful assistant." }]
    },
    "actionHook": "/llm-done",
    "toolHook": "/tool-call"
  }
]
```

### Dial with Fallback
```json
[
  { "verb": "say", "text": "Connecting you now." },
  {
    "verb": "dial",
    "target": [{ "type": "phone", "number": "+15085551212" }],
    "answerOnBridge": true,
    "timeout": 30,
    "actionHook": "/dial-result"
  },
  { "verb": "say", "text": "The agent is unavailable. Goodbye." },
  { "verb": "hangup" }
]
```

### Call Queue
```json
[
  { "verb": "say", "text": "All agents are busy. You are in the queue." },
  {
    "verb": "enqueue",
    "name": "support",
    "waitHook": "/hold-music",
    "actionHook": "/queue-exit"
  }
]
```

## ActionHook Payloads

When a verb completes, jambonz invokes the `actionHook` URL (webhook) or sends an event (WebSocket) with result data. Every actionHook payload includes these base fields:

| Field | Description |
|-------|-------------|
| `call_sid` | Unique identifier for this call |
| `account_sid` | Your account identifier |
| `application_sid` | The application handling this call |
| `direction` | `inbound` or `outbound` |
| `from` | Caller phone number or SIP URI |
| `to` | Called phone number or SIP URI |
| `call_id` | SIP Call-ID |
| `call_status` | Current call state (`trying`, `ringing`, `early-media`, `in-progress`, `completed`, `failed`, `busy`, `no-answer`) |
| `sip_status` | SIP response code (e.g. `200`, `486`) |

### Verb-Specific Payload Fields

**gather**: `speech` (object with `alternatives[].transcript`), `digits` (string), `reason` (`speechDetected`, `dtmfDetected`, `timeout`)

**dial**: `dial_call_sid`, `dial_call_status`, `dial_sip_status`, `dial_sbc_callid`, `duration`

**llm**: `completion_reason` (`normal`, `timeout`, `error`), `llm_usage` (token counts)

**enqueue**: `queue_result` (`dequeued`, `hangup`, `error`)

**transcribe**: `transcription` (object with transcript text)

## Application Environment Variables

jambonz has a built-in mechanism for application configuration that is **always preferred over `process.env`**. It works in two required steps:

1. **Declare** — Your app declares its configurable parameters with a schema. The jambonz portal discovers these via an HTTP `OPTIONS` request and renders a configuration form for administrators.
2. **Receive** — When a call arrives, jambonz delivers the configured values in the call payload as `env_vars`. Your app reads them from there.

**IMPORTANT**: Both steps are required. If you only declare without reading, the values are ignored. If you only read without declaring, the portal won't discover the parameters and won't send them. NEVER use `process.env` for values that should be configurable per-application in the jambonz portal.

**When to use env vars**: Phone numbers to dial, API keys, language/voice preferences, greeting text, queue names, timeout values, feature flags, or any value that might change between deployments or users. If in doubt, make it an env var.

### Step 1: Define the Schema

Define a schema object where each key is a parameter name and the value describes its type and UI behavior:

```typescript
const envVars = {
  API_KEY: { type: 'string', description: 'Your API key', required: true, obscure: true },
  LANGUAGE: { type: 'string', description: 'TTS language', default: 'en-US', enum: ['en-US', 'es-ES', 'fr-FR'] },
  MAX_RETRIES: { type: 'number', description: 'Max retry attempts', default: 3 },
  CARRIER: { type: 'string', description: 'Outbound carrier', jambonzResource: 'carriers' },
  SYSTEM_PROMPT: { type: 'string', description: 'LLM system prompt', uiHint: 'textarea' },
  TLS_CERT: { type: 'string', description: 'TLS certificate', uiHint: 'filepicker' },
};
```

Each parameter supports:

| Property | Required | Description |
|----------|----------|-------------|
| `type` | Yes | `'string'` \| `'number'` \| `'boolean'` |
| `description` | Yes | Human-readable label shown in the portal |
| `required` | No | Whether the user must provide a value |
| `default` | No | Pre-filled default value |
| `enum` | No | Array of allowed values — renders as a dropdown |
| `obscure` | No | Masks the value in the portal UI (for secrets/API keys) |
| `uiHint` | No | `'input'` (default single-line), `'textarea'` (multi-line), or `'filepicker'` (file upload with textarea) |
| `jambonzResource` | No | Populate a dropdown from jambonz account data. Currently supports `'carriers'` (lists VoIP carriers on the account) |

**Notes on `jambonzResource`**: When set to `'carriers'`, the portal fetches the VoIP carriers configured for the account and renders them as a dropdown. The stored value is the carrier name. This is preferred over hardcoding carrier names or using `enum` with static values.

### Step 2: Register and Read — WebSocket Apps

Pass `envVars` to `createEndpoint` to register the declaration (the SDK auto-responds to OPTIONS requests), then read values from `session.data.env_vars`:

```typescript
import http from 'http';
import { createEndpoint } from '@jambonz/sdk/websocket';

const envVars = {
  GREETING: { type: 'string', description: 'Greeting message', default: 'Hello!' },
  LANGUAGE: { type: 'string', description: 'TTS language', default: 'en-US' },
};

const server = http.createServer();
const makeService = createEndpoint({ server, port: 3000, envVars });  // Step 1: declare

const svc = makeService({ path: '/' });

svc.on('session:new', (session) => {
  const greeting = session.data.env_vars?.GREETING || 'Hello!';       // Step 2: read
  const language = session.data.env_vars?.LANGUAGE || 'en-US';

  session.say({ text: greeting, language }).hangup().send();
});
```

### Step 2: Register and Read — Webhook Apps

Use `envVarsMiddleware` to register the declaration (auto-responds to OPTIONS requests), then read values from `req.body.env_vars`:

```typescript
import express from 'express';
import { WebhookResponse, envVarsMiddleware } from '@jambonz/sdk/webhook';

const envVars = {
  GREETING: { type: 'string', description: 'Greeting message', default: 'Hello!' },
  LANGUAGE: { type: 'string', description: 'TTS language', default: 'en-US' },
};

const app = express();
app.use(express.json());
app.use(envVarsMiddleware(envVars));                                    // Step 1: declare

app.post('/incoming', (req, res) => {
  const greeting = req.body.env_vars?.GREETING || 'Hello!';            // Step 2: read
  const language = req.body.env_vars?.LANGUAGE || 'en-US';

  const jambonz = new WebhookResponse();
  jambonz.say({ text: greeting, language }).hangup();
  res.json(jambonz);
});
```

**Note**: `env_vars` is only present in the initial call webhook (or `session:new` for WebSocket), not in subsequent actionHook callbacks. If you need env var values in actionHook handlers, store them in a variable during the initial call.

## Mid-Call Control

Active calls can be modified asynchronously — inject verbs, mute, redirect, or start recording while the call is in progress.

### REST API (Webhook Apps)

Use `PUT /v1/Accounts/{accountSid}/Calls/{callSid}` to modify an active call:

```json
{ "whisper": { "verb": "say", "text": "Supervisor is listening." } }
{ "mute_status": "mute" }
{ "call_hook": "https://example.com/new-flow" }
{ "call_status": "completed" }
{ "listen_status": "pause" }
```

The SDK provides typed methods:
```typescript
import { JambonzClient } from '@jambonz/sdk/client';
const client = new JambonzClient({ baseUrl, accountSid, apiKey });

await client.calls.whisper(callSid, { verb: 'say', text: 'Hello' });
await client.calls.mute(callSid, 'mute');
await client.calls.redirect(callSid, 'https://example.com/new-flow');
await client.calls.update(callSid, { call_status: 'completed' });
```

### Inject Commands (WebSocket Apps)

WebSocket sessions can inject commands for immediate execution:

```typescript
// Recording
session.injectRecord('startCallRecording', { siprecServerURL: 'sip:recorder@example.com' });
session.injectRecord('stopCallRecording');

// Whisper a verb to one party
session.injectWhisper({ verb: 'say', text: 'You have 5 minutes remaining.' });

// Mute/unmute
session.injectMute('mute');
session.injectMute('unmute');

// Pause/resume audio streaming
session.injectListenStatus('pause');

// Send DTMF
session.injectDtmf('1');

// Attach metadata
session.injectTag({ supervisor: 'jane', priority: 'high' });

// Generic inject (for any command)
session.injectCommand('redirect', { call_hook: '/new-flow' });
```

## WebSocket Protocol

### Message Types (jambonz → app)

| Type | Description |
|------|-------------|
| `session:new` | New call session established. Contains call details. |
| `session:redirect` | Call was redirected to this app. |
| `verb:hook` | An actionHook fired (e.g. gather completed). Contains `hook` (the actionHook name) and `data` (the payload). The SDK emits this as `session.on('/hookName', handler)`. Respond with `.reply()`. |
| `verb:status` | Informational verb status notification (no reply needed). |
| `call:status` | Call state changed (e.g. `completed`). |
| `llm:tool-call` | LLM requested a tool/function call. |
| `llm:event` | LLM lifecycle event (connected, tokens, etc.). |
| `tts:tokens-result` | Ack for a TTS token streaming message. |
| `tts:streaming-event` | TTS streaming lifecycle event (e.g. user interruption). |

### Message Types (app → jambonz)

| Type | Description |
|------|-------------|
| `ack` | Acknowledge a received message. Include verbs in the `data` array to replace the current verb stack. |
| `command` | Send a command (e.g. inject a verb, control recording). |
| `llm:tool-output` | Return the result of a tool call to the LLM. |
| `tts:tokens` | Stream TTS text tokens for incremental speech synthesis. |
| `tts:flush` | Signal end of a TTS token stream. |

### Session Events (SDK)

The SDK `Session` object emits events for common message types:

```typescript
// ActionHook events — the hook name IS the event name. Respond with .reply()
session.on('/echo', (data) => { /* gather actionHook fired */ session.say({text: '...'}).reply(); });
session.on('/dial-result', (data) => { /* dial actionHook */ session.reply(); });
session.on('/llm-complete', (data) => { /* llm actionHook */ session.hangup().reply(); });

// Fallback — fires for any verb:hook without a specific listener
session.on('verb:hook', (hook, data) => { /* generic actionHook handler */ });

// Status events (informational — no reply needed)
session.on('verb:status', (data) => { /* verb status notification */ });
session.on('call:status', (data) => { /* call state change */ });

// LLM events
session.on('llm:tool-call', (data) => { /* tool call from LLM */ });
session.on('llm:event', (data) => { /* LLM event */ });

// TTS streaming — specific lifecycle events
session.on('tts:stream_open', (data) => { /* vendor connection established */ });
session.on('tts:stream_paused', (data) => { /* backpressure: buffer full */ });
session.on('tts:stream_resumed', (data) => { /* backpressure released */ });
session.on('tts:stream_closed', (data) => { /* TTS stream ended */ });
session.on('tts:user_interruption', (data) => { /* user barge-in (with event data) */ });
session.on('tts:user_interrupt', () => { /* user barge-in (convenience, no data) */ });
// Catch-all for any TTS streaming event
session.on('tts:streaming-event', (data) => { /* data.event_type has the type */ });

// Connection lifecycle
session.on('close', (code, reason) => { /* connection closed */ });
session.on('error', (err) => { /* error */ });
```

## Audio WebSocket (Listen/Stream)

The `listen` and `stream` verbs open a separate WebSocket connection from jambonz to your application, carrying raw audio. This is independent of the control WebSocket (`ws.jambonz.org`) — it uses the `audio.drachtio.org` subprotocol.

### Receiving Audio in the Same Application

Use `makeService.audio()` to register an audio WebSocket handler on the same server that handles the control pipe:

```typescript
import http from 'http';
import { createEndpoint } from '@jambonz/sdk/websocket';

const server = http.createServer();
const makeService = createEndpoint({ server, port: 3000 });

// Control pipe — handles call sessions
const svc = makeService({ path: '/' });

// Audio pipe — receives listen/stream audio
const audioSvc = makeService.audio({ path: '/audio-stream' });

svc.on('session:new', (session) => {
  session
    .answer()
    .say({ text: 'Recording your audio.' })
    .listen({
      url: '/audio-stream',           // relative path — jambonz connects back to same server
      sampleRate: 16000,
      mixType: 'mono',
      metadata: { purpose: 'recording' },
    })
    .hangup()
    .send();
});

audioSvc.on('connection', (stream) => {
  console.log(`Audio from call ${stream.callSid}, rate=${stream.sampleRate}`);
  console.log('Metadata:', stream.metadata);

  stream.on('audio', (pcm: Buffer) => {
    // L16 PCM binary frames
  });

  stream.on('close', () => {
    console.log('Audio stream closed');
  });
});
```

### AudioStream API

The `stream` object in the `connection` event is an `AudioStream` instance:

**Properties**: `metadata` (initial JSON), `callSid`, `sampleRate`

**Events**:
- `audio` — L16 PCM binary frame (`Buffer`)
- `dtmf` — `{digit, duration}` (only if `passDtmf: true` on listen verb)
- `playDone` — `{id}` (after non-streaming playAudio completes)
- `mark` — `{name, event}` where event is `'playout'` or `'cleared'`
- `close` — `(code, reason)`
- `error` — `(err)`

### Sending Audio Back (Bidirectional)

The listen verb supports bidirectional audio. There are two modes, controlled by the `bidirectionalAudio.streaming` option on the listen verb.

**Non-streaming mode** (`streaming: false`, the default) — send complete audio clips as base64:

```typescript
stream.playAudio(base64Content, {
  audioContentType: 'raw',   // or 'wav'
  sampleRate: 16000,
  id: 'greeting',            // optional — returned in playDone event
  queuePlay: true,           // true: queue after current; false: interrupt (default)
});

stream.on('playDone', (evt) => {
  console.log(`Finished playing: ${evt.id}`);
});
```

Up to 10 playAudio commands can be queued simultaneously.

**Streaming mode** (`streaming: true`) — send raw binary PCM frames directly:

```typescript
// In the listen verb config:
// bidirectionalAudio: { enabled: true, streaming: true, sampleRate: 16000 }

stream.on('audio', (pcm) => {
  // Echo audio back (or send processed/generated audio)
  stream.sendAudio(pcm);
});
```

### Marks (Synchronization Markers)

Marks let you track when streamed audio has been played out to the caller. They work **only with bidirectional streaming mode** — you must enable `bidirectionalAudio: { enabled: true, streaming: true }` on the listen verb.

The pattern is: stream audio via `sendAudio()`, then send a mark. When all the audio sent before the mark finishes playing out, jambonz sends back a mark event with `event: 'playout'`. This is how you know the caller has heard a specific chunk of audio.

```typescript
// Listen verb must enable bidirectional streaming for marks to work
session
  .listen({
    url: '/audio',
    actionHook: '/listen-done',
    bidirectionalAudio: {
      enabled: true,
      streaming: true,
      sampleRate: 8000,
    },
  })
  .send();

// In the audio handler:
audioSvc.on('connection', (stream) => {
  // Stream audio, then mark a sync point
  stream.sendAudio(pcmBuffer);
  stream.sendMark('chunk-1');   // fires 'playout' when audio above finishes playing

  stream.sendAudio(morePcm);
  stream.sendMark('chunk-2');   // fires 'playout' when this audio finishes

  // Listen for mark events
  stream.on('mark', (evt) => {
    // evt.name = 'chunk-1' or 'chunk-2'
    // evt.event = 'playout' (audio played) or 'cleared' (mark was cleared)
  });

  // Clear all pending marks (unplayed marks get event='cleared')
  stream.clearMarks();
});
```

**Important**: Without `bidirectionalAudio.streaming: true`, marks are accepted but never fire — there is no playout buffer to sync against. This is the most common mistake when marks appear to silently fail.

### Other Commands

```typescript
stream.killAudio();           // Stop playback, flush buffer
stream.disconnect();          // Close connection, end listen verb
stream.sendMark('sync-pt');   // Insert synchronization marker
stream.clearMarks();          // Clear all pending markers
stream.close();               // Close the WebSocket
```

## Recording

jambonz supports SIPREC-based call recording. Recording is controlled mid-call via inject commands (WebSocket) or future REST API extensions.

### WebSocket Recording
```typescript
// Start recording — sends audio via SIPREC to a recording server
session.injectRecord('startCallRecording', {
  siprecServerURL: 'sip:recorder@example.com',
  recordingID: 'my-recording-123',  // optional
});

// Pause/resume recording
session.injectRecord('pauseCallRecording');
session.injectRecord('resumeCallRecording');

// Stop recording
session.injectRecord('stopCallRecording');
```

**Important**: The `dial` verb must use `anchorMedia: true` for recording to work during bridged calls. Without media anchoring, audio doesn't flow through the jambonz media server.

## REST API

jambonz provides a REST API for platform management and active call control. The API client is available in the SDK at `@jambonz/sdk/client`.

Key resources:
- **Calls** — Create outbound calls, query active calls, modify in-progress calls (redirect, whisper, mute, hangup)
- **Messages** — Send SMS/MMS messages

## Code Structure

### Single File (default)

For simple applications with 1-2 routes, put everything in a single file. This is the default for all examples in this repo and is perfectly suitable for production use.

### Multi-File with Routes Directory

For applications with 3+ routes or significant per-route logic, split into a `src/` directory with a routes folder:

```
src/
  app.ts              ← entry point: server setup, route registration
  routes/
    incoming.ts       ← handler for one endpoint/path
    hold-music.ts
    queue-exit.ts
```

**Webhook pattern** — each route file exports an Express route handler:

```typescript
// src/routes/incoming.ts
import type { Request, Response } from 'express';
import { WebhookResponse } from '@jambonz/sdk/webhook';

export default function incoming(_req: Request, res: Response) {
  const jambonz = new WebhookResponse();
  jambonz
    .say({ text: 'Thank you for calling. Please hold.' })
    .enqueue({ name: 'support', waitHook: '/hold-music', actionHook: '/queue-exit' });
  res.json(jambonz);
}
```

```typescript
// src/app.ts
import express from 'express';
import incoming from './routes/incoming.js';
import holdMusic from './routes/hold-music.js';
import queueExit from './routes/queue-exit.js';

const app = express();
app.use(express.json());

app.post('/incoming', incoming);
app.post('/hold-music', holdMusic);
app.post('/queue-exit', queueExit);

app.listen(3000, () => console.log('Listening on port 3000'));
```

**WebSocket pattern** — there are two cases to consider:

1. **Multiple services** (different `makeService({ path })` calls — each path gets its own `session:new`). Each route file exports a function that takes a session:

```typescript
// src/routes/caller.ts
import type { Session } from '@jambonz/sdk/websocket';

export default function caller(session: Session) {
  session
    .say({ text: 'Please hold.' })
    .enqueue({ name: 'support', waitHook: '/hold-music', actionHook: '/queue-exit' })
    .send();
}
```

```typescript
// src/app.ts
import http from 'http';
import { createEndpoint } from '@jambonz/sdk/websocket';
import caller from './routes/caller.js';
import agent from './routes/agent.js';

const server = http.createServer();
const makeService = createEndpoint({ server, port: 3000 });

makeService({ path: '/incoming' }).on('session:new', (session) => caller(session));
makeService({ path: '/agent' }).on('session:new', (session) => agent(session));
```

2. **Multiple actionHook handlers on one session** — extract handler functions, but register them all within `session:new`:

```typescript
// src/routes/echo-handler.ts
import type { Session } from '@jambonz/sdk/websocket';

export default function echoHandler(session: Session, evt: Record<string, any>) {
  if (evt.reason === 'speechDetected') {
    const text = evt.speech?.alternatives?.[0]?.transcript || 'nothing';
    session.say({ text: `You said: ${text}` })
      .gather({ input: ['speech'], actionHook: '/echo', timeout: 10 })
      .reply();
  } else {
    session.gather({ input: ['speech'], actionHook: '/echo', timeout: 10,
      say: { text: 'I didn\'t hear anything. Try again.' } }).reply();
  }
}
```

```typescript
// src/app.ts — wire it up
svc.on('session:new', (session) => {
  session.on('/echo', (evt) => echoHandler(session, evt));
  session.gather({ input: ['speech'], actionHook: '/echo', timeout: 10,
    say: { text: 'Say something.' } }).send();
});
```

### When to Split

- **1-2 routes, simple logic** → single file
- **3+ routes or substantial per-route logic** → `src/app.ts` + `src/routes/`
- **Shared config, prompts, or utilities** → `src/config.ts`, `src/prompts.ts`, etc.

When in doubt, start with a single file. It's easy to split later.

## Examples

Complete working examples are in the `examples/` directory:
- **hello-world** — Minimal greeting (webhook + WebSocket)
- **echo** — Speech echo using gather with actionHook pattern (webhook + WebSocket). The canonical example for understanding actionHook event handling.
- **ivr-menu** — Interactive menu with speech and DTMF input (webhook)
- **dial** — Simple outbound dial to a phone number (webhook)
- **listen-record** — Record audio using the listen verb to stream to a WebSocket (webhook)
- **voice-agent** — LLM-powered conversational AI with tool calls (webhook + WebSocket)
- **openai-realtime** — OpenAI Realtime API voice agent with function calling (WebSocket)
- **deepgram-voice-agent** — Deepgram Voice Agent API with function calling (WebSocket)
- **llm-streaming** — Anthropic LLM with TTS token streaming and barge-in (WebSocket)
- **queue-with-hold** — Call queue with hold music and agent dequeue (webhook + WebSocket)
- **call-recording** — Mid-call recording control via REST API and inject commands (webhook + WebSocket)
- **realtime-translator** — Bridges two parties with real-time speech translation using STT, Google Translate, and TTS dub tracks. Multi-file example with `src/routes/` structure (WebSocket)

## Key Concepts

- **Verb**: A JSON object with a `verb` property that tells jambonz what to do. Verbs execute sequentially.
- **ActionHook**: A webhook URL that jambonz calls when a verb completes. Returns the next verb array. Payload includes call details and verb-specific results.
- **Synthesizer**: TTS configuration (vendor, voice, language).
- **Recognizer**: STT configuration (vendor, language, model).
- **Target**: A call destination (phone number, SIP URI, registered user, Teams user).
- **Session**: A single phone call. Session-level settings (set via `config`) persist across verbs.
- **Inject Command**: Asynchronous mid-call modification (WebSocket). Executes immediately without replacing the verb stack.
