---
name: jambonz
description: >-
  Build voice applications on jambonz, an open-source CPaaS. Covers the verb
  model, webhook and WebSocket transports, IVR menus, AI voice agents (OpenAI
  Realtime, Deepgram, ElevenLabs, Google, Ultravox, pipeline), call routing,
  queuing, recording, mid-call control, and SIP. Works with @jambonz/sdk
  (TypeScript) or raw JSON from any language. Use with the jambonz MCP server
  for schema lookups.
license: MIT
metadata:
  author: "jambonz"
  version: "0.1.0"
  languages: "typescript, python, any"
  domain: "telephony"
---

# jambonz Voice Application Skill

jambonz is an open-source CPaaS (Communications Platform as a Service) for building voice and messaging applications. It handles telephony infrastructure — SIP, carriers, phone numbers, media processing — so you can focus on application logic. Your application controls calls by returning **arrays of verbs** — JSON instructions that execute sequentially.

## Using This Skill with the MCP Server

This skill provides decision-making guidance — which verbs to use, which transport to pick, common patterns, and gotchas. For detailed schema lookups and the full SDK reference, use the jambonz MCP server tools:

1. **Before writing any jambonz code**, call `jambonz_developer_toolkit` to get the complete SDK guide (AGENTS.md) and schema index.
2. **When you need a verb's exact properties**, call `get_jambonz_schema` with the verb, component, or callback name.
3. **If MCP tools are unavailable**, read `AGENTS.md` from the repo root and schema files from `schema/verbs/`, `schema/components/`, `schema/callbacks/`.

**Workflow**: Use this skill to decide *what* to build → use MCP tools to look up *how* to build it.

## Server Versions

jambonz has two editions: **v0.9.x (open source)** and **v10.x (commercial)**. Each verb schema includes a `minVersion` field. Only ask the user about their server version if a verb requires `minVersion` higher than `0.9.6`. If all verbs needed have `minVersion: "0.9.6"`, the code works on both editions.

## Transport Selection

Choose the transport based on what the application needs:

### Use WebSocket when:
- Using any speech-to-speech verb (`openai_s2s`, `google_s2s`, `deepgram_s2s`, `ultravox_s2s`, `elevenlabs_s2s`, `s2s`, `pipeline`) — **mandatory**
- Streaming raw audio (`listen`/`stream` verb with bidirectional audio)
- Using TTS token streaming
- Building complex conversational flows with session state
- Needing bidirectional real-time events or async mid-call control from the app

### Use Webhook when:
- Simple IVR menus (gather + say)
- Call routing (dial to a number or SIP endpoint)
- Voicemail or basic record-and-hang-up
- Any straightforward request-response pattern

**Rule**: If ANY verb in the application requires WebSocket, the entire application must use WebSocket transport. The verb JSON structure is identical in both modes — only the transport differs.

## Verb Selection by Task

Use this decision tree to pick the right verb(s) for the task.

### "Build a voice AI agent / chatbot"

The user wants a caller to have a conversation with an LLM.

**Is the LLM vendor known at build time?** Use the vendor-specific shortcut:
- OpenAI → `openai_s2s`
- Google → `google_s2s`
- Deepgram → `deepgram_s2s`
- Ultravox → `ultravox_s2s`
- ElevenLabs → `elevenlabs_s2s` (special: uses `agent_id`, not model/messages)

**Is the vendor determined at runtime** (e.g. from an env var)? Use `s2s` with `vendor` property.

**Does the user want jambonz to orchestrate STT + LLM + TTS as separate components?** Use `pipeline`.

**Never use `llm` in generated code** — it is a legacy name. Use either a vendor shortcut or `s2s`.

See [references/voice-ai-guide.md](references/voice-ai-guide.md) for details on s2s vs pipeline, tool calling, and vendor specifics.

### "Build an IVR menu / collect input"

Use `gather` with nested `say` (for TTS prompt) or `play` (for audio file). Supports speech recognition, DTMF digits, or both.

See [references/ivr-patterns.md](references/ivr-patterns.md) for multi-level menus, timeout/retry, and input handling.

### "Transfer / connect / bridge a call"

- **Bridge to another party**: `dial` with a target (phone number, SIP URI, registered user, Teams user)
- **Blind SIP transfer**: `sip-refer`
- **Transfer to a different application/webhook**: `redirect`

### "Queue calls / hold music"

- **Put caller in queue**: `enqueue` (with `waitHook` for hold music)
- **Agent picks up from queue**: `dequeue`

### "Record the call"

Use SIPREC recording via inject commands (WebSocket) or REST API (webhook). The `dial` verb must use `anchorMedia: true` for recording during bridged calls.

### "Stream raw audio for custom processing"

Use `stream` (preferred name; `listen` is a synonym — always use `stream`).

### "Transcribe the call in real-time"

Use `transcribe` with a `transcriptionHook`.

### "Play audio or speak text"

- **TTS**: `say` (supports SSML, multiple voices)
- **Audio file**: `play` (from URL)
- **Background audio track**: `dub` (mixes alongside the call)

### "Send SMS/MMS"

Use `message`.

### "Reject an incoming call"

Use `sip-decline` with a SIP status code.

See [references/call-control.md](references/call-control.md) for dial targets, SIP operations, conference, mid-call control, and recording details.

## Building the Application

### With @jambonz/sdk (TypeScript — recommended)

Install: `npm install @jambonz/sdk` (plus `express` for webhook apps).

**Webhook pattern**:
```typescript
import express from 'express';
import { WebhookResponse } from '@jambonz/sdk/webhook';

const app = express();
app.use(express.json());

app.post('/incoming', (req, res) => {
  const jambonz = new WebhookResponse();
  jambonz.say({ text: 'Hello!' }).hangup();
  res.json(jambonz);
});

// Required: call status handler
app.post('/call-status', (req, res) => {
  console.log(`Call ${req.body.call_sid} status: ${req.body.call_status}`);
  res.sendStatus(200);
});

app.listen(3000);
```

**WebSocket pattern**:
```typescript
import http from 'http';
import { createEndpoint } from '@jambonz/sdk/websocket';

const server = http.createServer();
const makeService = createEndpoint({ server, port: 3000 });
const svc = makeService({ path: '/' });

svc.on('session:new', (session) => {
  // Bind actionHook handlers BEFORE send()
  session.on('/gather-result', (evt) => {
    session.say({ text: `You said: ${evt.speech?.alternatives?.[0]?.transcript}` })
      .reply();  // reply() for all subsequent responses
  });

  session
    .gather({ input: ['speech'], actionHook: '/gather-result', timeout: 10,
      say: { text: 'Say something.' } })
    .send();  // send() — initial response only, exactly once
});
```

**Critical SDK rules**:
- `.send()` — use ONCE for the initial verb array (response to `session:new`)
- `.reply()` — use for ALL subsequent responses (actionHook events)
- Bind actionHook handlers BEFORE calling `.send()`
- Use `session.locals` for call-scoped state that persists across hooks
- Use `session.data.env_vars` (WS) or `req.body.env_vars` (webhook) for configurable values — never `process.env`

### Without the SDK (Python, Go, or any language)

jambonz verbs are plain JSON. Any language that can serve HTTP or WebSocket can build jambonz apps.

**Webhook**: HTTP server receives POST with call data, returns JSON array of verbs:
```json
[
  { "verb": "say", "text": "Hello!" },
  { "verb": "gather", "input": ["speech"], "actionHook": "/result", "timeout": 10,
    "say": { "text": "Say something." } }
]
```

**WebSocket**: Connect to jambonz WS endpoint, receive JSON messages, send JSON verb arrays back. See the WebSocket Protocol section of AGENTS.md (via `jambonz_developer_toolkit`) for the message format.

Use `get_jambonz_schema` to look up the exact JSON structure for any verb.

### Both modes

- Webhook apps **must** include a call-status POST handler (logs lifecycle events, returns 200)
- Use jambonz application environment variables for configurable values (see [references/env-vars-and-config.md](references/env-vars-and-config.md))

## Common Gotchas

1. **Using `llm` verb name** — Always use vendor shortcuts (`openai_s2s`, etc.) or `s2s`. Never `llm`.
2. **Using `listen` verb name** — Always use `stream`. They are synonyms; `stream` is preferred.
3. **`.send()` vs `.reply()` confusion** — `.send()` is the initial response only. `.reply()` is for all actionHook responses. Using `.send()` in an actionHook handler will fail.
4. **Missing `anchorMedia: true` on `dial`** — Required for recording during bridged calls. Without it, audio doesn't flow through the media server.
5. **Using `process.env`** — jambonz apps should use application environment variables (`session.data.env_vars` / `req.body.env_vars`), not `process.env`.
6. **`env_vars` only on initial call** — The `env_vars` object is only present in the first webhook POST or `session:new`. Store values in a variable if needed in actionHook handlers.
7. **Webhook transport for s2s/pipeline apps** — These verbs require WebSocket. Always use `createEndpoint` from `@jambonz/sdk/websocket`.
8. **ElevenLabs: passing `model` or `messages`** — ElevenLabs uses `agent_id` auth. The model and prompt are configured in the ElevenLabs dashboard. Pass `llmOptions: {}`.
9. **Marks silently failing** — Marks require `bidirectionalAudio: { enabled: true, streaming: true }` on the listen/stream verb. Without streaming mode, marks are accepted but never fire.
10. **Not binding actionHook listeners before `.send()`** — In WebSocket mode, if no listener is bound for an actionHook, the SDK auto-replies with an empty verb array, which usually means the call hangs up unexpectedly.
11. **Forgetting the `/call-status` handler** — Webhook apps must handle call status POST requests. Missing this causes errors in the jambonz logs.

## Project Scaffolding

### TypeScript / SDK

- **Simple apps (1-2 routes)**: Single file. This is the default and works fine for production.
- **Complex apps (3+ routes)**: `src/app.ts` + `src/routes/` directory.
- **Dependencies**: `@jambonz/sdk` always. Add `express` for webhook apps. WebSocket apps need no additional deps.
- **Import paths**: `@jambonz/sdk/webhook`, `@jambonz/sdk/websocket`, `@jambonz/sdk/client`
- **TypeScript config**: `"module": "nodenext"`, `"moduleResolution": "nodenext"`
- Always generate a complete `package.json` with all required dependencies.

### Other Languages

- Any HTTP framework for webhooks (Flask, Gin, etc.)
- Any WebSocket library for WS mode
- Return JSON arrays matching the verb schemas (use `get_jambonz_schema` to verify structure)
- The verb JSON format is identical regardless of language

## Reference Files

Load these on demand based on the task:

- [references/voice-ai-guide.md](references/voice-ai-guide.md) — **Load when** building s2s or pipeline voice AI apps. Covers s2s vs pipeline decision, vendor shortcuts, tool/function calling, TTS streaming, eventHook patterns.
- [references/ivr-patterns.md](references/ivr-patterns.md) — **Load when** building IVR menus or gather-based input collection. Covers speech/DTMF/mixed input, multi-level menus, timeout and retry patterns.
- [references/call-control.md](references/call-control.md) — **Load when** building apps with dial, transfer, queuing, conference, recording, or mid-call control. Covers dial targets, SIP ops, enqueue/dequeue, REST API control, inject commands.
- [references/env-vars-and-config.md](references/env-vars-and-config.md) — **Load when** the app needs configurable parameters. Covers the two-step declare+read pattern, schema properties, the "only on initial call" gotcha.
