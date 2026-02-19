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
- **llm** — Connect the caller to an LLM for real-time voice conversation. Handles the full STT→LLM→TTS pipeline.
- **pipeline** — Higher-level voice AI pipeline with integrated turn detection.
- **listen** / **stream** — Stream raw audio to a websocket endpoint for custom processing.
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

## Common Patterns

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
    "verb": "llm",
    "vendor": "openai",
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

**dial**: `dial_call_sid`, `dial_call_status`, `dial_sip_status`, `duration`

**llm**: `completion_reason` (`normal`, `timeout`, `error`), `llm_usage` (token counts)

**enqueue**: `queue_result` (`dequeued`, `hangup`, `error`)

**transcribe**: `transcription` (object with transcript text)

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
| `verb:status` | A verb completed or changed status. Contains actionHook data. |
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
session.on('session:new', (session) => { /* new call */ });
session.on('verb:status', (data) => { /* verb completed */ });
session.on('call:status', (data) => { /* call state change */ });
session.on('llm:tool-call', (data) => { /* tool call from LLM */ });
session.on('llm:event', (data) => { /* LLM event */ });
session.on('tts:user_interrupt', () => { /* user interrupted TTS */ });
session.on('close', (code, reason) => { /* connection closed */ });
session.on('error', (err) => { /* error */ });
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

## Examples

Complete working examples are in the `examples/` directory:
- **hello-world** — Minimal greeting (webhook + WebSocket)
- **ivr-menu** — Interactive menu with speech and DTMF input (webhook)
- **voice-agent** — LLM-powered conversational AI (webhook + WebSocket)
- **queue-with-hold** — Call queue with hold music and agent dequeue (webhook + WebSocket)
- **call-recording** — Mid-call recording control via REST API and inject commands (webhook + WebSocket)

## Key Concepts

- **Verb**: A JSON object with a `verb` property that tells jambonz what to do. Verbs execute sequentially.
- **ActionHook**: A webhook URL that jambonz calls when a verb completes. Returns the next verb array. Payload includes call details and verb-specific results.
- **Synthesizer**: TTS configuration (vendor, voice, language).
- **Recognizer**: STT configuration (vendor, language, model).
- **Target**: A call destination (phone number, SIP URI, registered user, Teams user).
- **Session**: A single phone call. Session-level settings (set via `config`) persist across verbs.
- **Inject Command**: Asynchronous mid-call modification (WebSocket). Executes immediately without replacing the verb stack.
