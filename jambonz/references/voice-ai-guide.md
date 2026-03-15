# Voice AI Guide

This reference covers building AI-powered voice agents with jambonz — speech-to-speech (s2s) verbs and the pipeline verb.

## s2s vs Pipeline: When to Use Which

### Speech-to-Speech (s2s) Verbs

Use s2s when a **single vendor handles the full voice conversation** — STT, LLM reasoning, and TTS are all managed by the vendor's API. jambonz connects the caller's audio stream directly to the vendor.

Available vendor shortcuts (always prefer these over generic `s2s`):
- `openai_s2s` — OpenAI Realtime API
- `google_s2s` — Google Gemini Live
- `deepgram_s2s` — Deepgram Voice Agent API
- `ultravox_s2s` — Fixie Ultravox
- `elevenlabs_s2s` — ElevenLabs Conversational AI (special auth model)

Use generic `s2s` with `vendor` property **only** when the vendor is determined at runtime.

### Pipeline Verb

Use `pipeline` when you want **jambonz to orchestrate separate STT, LLM, and TTS components**. This gives you:
- Mix-and-match: e.g. Deepgram STT + Anthropic LLM + ElevenLabs TTS
- More control over each component's configuration
- Built-in turn detection and interruption handling

The pipeline verb has three main configuration blocks: `recognizer` (STT), `llm` (text LLM), and `synthesizer` (TTS).

## Vendor-Specific Details

### OpenAI (`openai_s2s`)

- Supports `model` (e.g. `gpt-4o-realtime-preview`) and `llmOptions.messages` for system prompt
- Function calling via `toolHook`
- Events via `eventHook`
- Look up full schema: `get_jambonz_schema('openai_s2s')`

### Google (`google_s2s`)

- Uses Google Gemini Live API
- Supports `model` and `llmOptions.messages`
- Look up full schema: `get_jambonz_schema('google_s2s')`

### Deepgram (`deepgram_s2s`)

- Uses Deepgram Voice Agent API
- Supports `model` and `llmOptions.messages`
- Function calling via `toolHook`
- Look up full schema: `get_jambonz_schema('deepgram_s2s')`

### Ultravox (`ultravox_s2s`)

- Uses Fixie Ultravox API
- Supports `model` and `llmOptions.messages`
- Look up full schema: `get_jambonz_schema('ultravox_s2s')`

### ElevenLabs (`elevenlabs_s2s`) — Different Auth Model

ElevenLabs works differently from all other s2s vendors:

- **Create an agent first** in the ElevenLabs dashboard. The agent's voice, personality, tools, and LLM are configured there.
- **`auth`**: requires `agent_id` (required), optionally `api_key` for signed URLs
- **`model`**: NOT used — configured in the ElevenLabs agent
- **`llmOptions`**: must be empty `{}` — do NOT pass `messages` or `temperature`
- **`llmOptions.conversation_initiation_client_data`**: optionally send data to the agent at conversation start
- **Always include `eventHook` and `events: ['all']`** — omitting eventHook causes server errors

```json
{
  "verb": "elevenlabs_s2s",
  "auth": { "agent_id": "your-agent-id", "api_key": "your-api-key" },
  "llmOptions": {},
  "actionHook": "/s2s-complete",
  "eventHook": "/event",
  "events": ["all"]
}
```

## Tool / Function Calling

s2s verbs support LLM tool calls (function calling). The pattern:

1. Configure `toolHook` on the s2s verb (a URL for webhooks, an event name for WebSocket)
2. When the LLM requests a tool call, jambonz invokes the `toolHook` with the tool name and arguments
3. Your app executes the function and returns the result

### WebSocket Tool Calling

```typescript
// Listen for tool calls
session.on('/tool-call', (evt) => {
  // evt contains: tool_call_id, name, args
  const result = executeMyFunction(evt.name, evt.args);
  session.sendToolOutput(evt.tool_call_id, result);
});

session
  .openai_s2s({
    model: 'gpt-4o-realtime-preview',
    llmOptions: {
      messages: [{ role: 'system', content: 'You are a helpful assistant.' }],
    },
    toolHook: '/tool-call',
    actionHook: '/s2s-done',
  })
  .send();
```

### Webhook Tool Calling

For webhook apps, the `toolHook` URL receives a POST with the tool call details. Return the tool result as JSON in the response body.

## Event Handling

s2s verbs emit events throughout the conversation lifecycle. Configure with `eventHook` and `events`:

```json
{
  "verb": "openai_s2s",
  "eventHook": "/events",
  "events": ["all"]
}
```

In WebSocket mode, listen for events:
```typescript
session.on('llm:event', (evt) => {
  // evt.event_type: 'connected', 'tokens', 'completion', etc.
});
```

## TTS Token Streaming

For pipeline or custom flows where you generate text and want incremental TTS:

1. Enable streaming: `session.config({ ttsStream: { enable: true } })`
2. Send tokens: `await session.sendTtsTokens('chunk of text')`
3. Flush when done: `session.flushTtsTokens()`
4. Handle backpressure via events:
   - `tts:stream_paused` — buffer full, stop sending
   - `tts:stream_resumed` — buffer drained, resume sending
   - `tts:user_interrupt` — user barged in, clear pending tokens

```typescript
session.on('tts:stream_paused', () => { /* pause sending */ });
session.on('tts:stream_resumed', () => { /* resume sending */ });
session.on('tts:user_interrupt', () => {
  session.clearTtsTokens();
  // Optionally start new response
});
```

## Common Voice AI Patterns

### Simple voice agent (vendor shortcut)

```typescript
session
  .openai_s2s({
    model: 'gpt-4o-realtime-preview',
    llmOptions: {
      messages: [{ role: 'system', content: 'You are a friendly customer support agent.' }],
    },
    actionHook: '/done',
  })
  .send();
```

### Voice agent with tools

Add `toolHook` and bind a handler for tool execution. See the Tool / Function Calling section above.

### Pipeline (mix-and-match components)

```typescript
session
  .pipeline({
    recognizer: { vendor: 'deepgram', language: 'en-US' },
    llm: {
      vendor: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      messages: [{ role: 'system', content: 'You are a helpful assistant.' }],
    },
    synthesizer: { vendor: 'elevenlabs', voice: 'Rachel' },
    actionHook: '/done',
  })
  .send();
```

Look up full schema: `get_jambonz_schema('pipeline')`
