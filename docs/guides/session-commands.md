# Session Commands

Session commands are async operations you can perform at any time during an active WebSocket call. They are not verbs — they don't go in the verb array and don't execute sequentially. Instead, they're SDK method calls that send commands over the WebSocket immediately.

## TTS Token Streaming

TTS token streaming lets your app pipe text to jambonz incrementally — as tokens arrive from an LLM — rather than waiting for the full response. jambonz buffers the text, breaks it into natural chunks (sentence boundaries), and streams each chunk to the TTS engine. The caller hears the first sentence while the LLM is still generating the rest.

**This is different from `autoStreamTts`**. `autoStreamTts` is a jambonz-internal optimization: when a `say` verb has its complete text, jambonz streams the *audio* playback as TTS chunks arrive rather than waiting for full synthesis. Token streaming is app-level: your app sends *text* tokens incrementally via `sendTtsTokens()` while the LLM is still generating.

### Setup

Enable TTS streaming via the `config` verb before sending tokens:

```typescript
session
  .config({
    ttsStream: { enable: true },
    synthesizer: { vendor: 'elevenlabs', voice: 'EXAVITQu4vr4xnSDxMaL' },  // ElevenLabs requires voice ID, not name
  })
  .say({ text: 'Hi there, how can I help you?' })
  .send();
```

The `ttsStream.enable: true` setting opens a persistent connection to the TTS engine. You can optionally specify a different synthesizer in `ttsStream` to use a different vendor/voice for streaming than the session default.

### Methods

```typescript
// Send text tokens as they arrive from the LLM
await session.sendTtsTokens(tokenText);

// Signal end of the current response — flushes any buffered text
session.flushTtsTokens();

// Discard all buffered tokens (e.g. on user interruption)
session.clearTtsTokens();

// Check if jambonz has signalled backpressure
if (session.isTtsPaused) { /* wait before sending more */ }
```

`sendTtsTokens()` returns a Promise that resolves when jambonz acknowledges receipt. If the buffer is full, jambonz returns a `full` status and the SDK automatically pauses until a `tts:stream_resumed` event arrives.

### Events

```typescript
session.on('tts:stream_open', () => { /* vendor connection established */ });
session.on('tts:stream_paused', () => { /* backpressure: stop sending tokens */ });
session.on('tts:stream_resumed', () => { /* backpressure released: resume sending */ });
session.on('tts:stream_closed', () => { /* TTS stream ended */ });
session.on('tts:user_interrupt', () => { /* user barged in — stop LLM, clear tokens */ });
```

### Tracking What Was Actually Spoken (`trackTtsPlayout`)

When `trackTtsPlayout: true` is set in the `config` verb, jambonz uses word-level alignment data from the TTS engine to track exactly which words were played out to the caller. This requires a TTS vendor that supports alignment (currently ElevenLabs).

When the caller interrupts mid-response, jambonz fires a `tts:streaming-event` with:
```json
{ "event_type": "tts_spoken", "text": "only the words actually heard", "bargein": true }
```

On normal completion (no interruption):
```json
{ "event_type": "tts_spoken", "text": "the full response text", "bargein": false }
```

This is critical for maintaining accurate conversation history with the LLM — record only what the caller actually heard, not the full generated response that may have been cut short.

See the `callback:tts-streaming-event` schema for the full event payload.

## Inject Commands

Inject commands modify an active call without replacing the verb stack. They execute immediately alongside whatever verb is currently running.

### Recording

```typescript
// Start recording
session.injectRecord('startCallRecording', { siprecServerURL: 'sip:recorder@example.com' });

// Stop recording
session.injectRecord('stopCallRecording');

// Pause/resume
session.injectRecord('pauseCallRecording');
session.injectRecord('resumeCallRecording');
```

### Mute / Unmute

```typescript
session.injectMute('mute');
session.injectMute('unmute');
```

### Whisper

Inject a verb to play to one party (e.g. a supervisor message to the agent):

```typescript
session.injectWhisper({ verb: 'say', text: 'You have 5 minutes remaining.' });
```

### DTMF

```typescript
session.injectDtmf('1');
session.injectDtmf('1234#');
```

### Audio Stream Control

Pause or resume an active `listen`/`stream` verb:

```typescript
session.injectListenStatus('pause');
session.injectListenStatus('resume');
```

### Tag (Metadata)

Attach arbitrary metadata to the call:

```typescript
session.injectTag({ supervisor: 'jane', priority: 'high' });
```

### Redirect

Transfer call control to a different webhook:

```typescript
session.injectCommand('redirect', { call_hook: '/new-flow' });
```

### Generic Command

For any command not covered by a specific method:

```typescript
session.injectCommand('commandName', { ...data });
```

## Pipeline Update

The `updatePipeline()` method sends mid-conversation updates to an active `pipeline` verb. Four operation types are supported:

### Update Instructions

Replace the LLM system prompt while the conversation is in progress:

```typescript
session.updatePipeline({
  type: 'update_instructions',
  instructions: 'You are now a billing support agent. Help the caller with invoice questions.',
});
```

### Inject Context

Append messages to the LLM conversation history (e.g. CRM data retrieved after the call started):

```typescript
session.updatePipeline({
  type: 'inject_context',
  messages: [
    { role: 'system', content: 'Customer account #12345: Gold tier, 3 open tickets.' },
  ],
});
```

### Update Tools

Replace the tool set available to the LLM:

```typescript
session.updatePipeline({
  type: 'update_tools',
  tools: [
    {
      type: 'function',
      function: {
        name: 'transfer_call',
        description: 'Transfer the caller to a specialist',
        parameters: { type: 'object', properties: { department: { type: 'string' } } },
      },
    },
  ],
});
```

### Generate Reply

Prompt the LLM to generate a new response. If the pipeline is not idle, the request is queued and executes when the current turn completes. Use `interrupt: true` to cancel the current response and generate immediately.

```typescript
// Simple prompt
session.updatePipeline({
  type: 'generate_reply',
  user_input: 'The customer just entered their account number: 12345',
});

// With one-shot instructions
session.updatePipeline({
  type: 'generate_reply',
  user_input: 'Customer is asking about refunds',
  instructions: 'Be empathetic and offer a 20% discount before processing a refund.',
});

// Interrupt current response and generate a new one
session.updatePipeline({
  type: 'generate_reply',
  user_input: 'Urgent: supervisor override',
  interrupt: true,
});
```

## LLM Tool Output

When using the `pipeline` verb with a `toolHook`, tool call requests arrive as events. Return results with:

```typescript
session.on('/tool-hook', (evt: Record<string, any>) => {
  const { tool_call_id, name, arguments: args } = evt;

  // Process the tool call...
  const result = { temperature: 72, unit: 'F' };

  // Return the result to the LLM
  session.toolOutput(tool_call_id, result).reply();
});
```

The result is stringified and fed back to the LLM as the tool response.

## Building a Cascaded Voice AI Agent

The **pipeline** verb is the simplest way to build a voice AI agent — jambonz manages everything. But when you need full control over the LLM interaction (custom tool handling, conversation history management, multiple LLM providers, etc.), build a **cascaded agent**: your app handles STT transcripts and LLM calls directly, piping responses back via TTS token streaming.

### Architecture

```
config (ttsStream + bargeIn) → say (greeting)
    ↓
bargeIn fires '/speech-detected' with transcript
    ↓
App calls LLM with streaming → tokens arrive
    ↓
sendTtsTokens() pipes each token to jambonz → TTS plays audio
    ↓
flushTtsTokens() when LLM finishes → caller hears full response
    ↓
User speaks again → bargeIn fires → repeat
```

The key mechanism is the `bargeIn` actionHook on the `config` verb. When enabled with `sticky: true`, it persists across all verbs. Whenever the caller speaks, the `/speech-detected` hook fires with the speech transcript — even while TTS is playing (which triggers an interruption). Your app then calls the LLM and streams the response back.

### When to Use Cascaded vs Pipeline

| | Pipeline verb | Cascaded agent |
|---|---|---|
| **STT/LLM/TTS** | jambonz orchestrates all three | App owns the LLM; jambonz handles STT and TTS |
| **Turn detection** | Built-in (Krisp or STT-native) | App manages via bargeIn actionHook |
| **Tool calls** | Via toolHook | App handles directly in LLM loop |
| **Conversation history** | jambonz manages internally | App manages — full control |
| **Complexity** | Low — one verb | Higher — app manages LLM streaming and history |
| **Use when** | Standard voice AI agent | Custom LLM logic, multiple providers, precise history control |

### Example (TypeScript)

```typescript
import Anthropic from '@anthropic-ai/sdk';
import http from 'http';
import { createEndpoint } from '@jambonz/sdk/websocket';

const server = http.createServer();
const makeService = createEndpoint({ server, port: 3000 });
const svc = makeService({ path: '/' });

svc.on('session:new', (session) => {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  let assistantResponse = '';
  let userInterrupt = false;

  session
    .on('/speech-detected', async (evt: Record<string, any>) => {
      const { speech } = evt;
      session.reply();  // Acknowledge immediately

      if (speech?.is_final) {
        const { transcript } = speech.alternatives[0];
        messages.push({ role: 'user', content: transcript });
        userInterrupt = false;

        const stream = await client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: 'You are a helpful voice assistant. Keep answers concise.',
          messages,
          stream: true,
        });

        for await (const event of stream) {
          if (userInterrupt) {
            messages.push({ role: 'assistant', content: `${assistantResponse}...` });
            assistantResponse = '';
            break;
          }
          if ((event as any).delta?.text) {
            const tokens = (event as any).delta.text;
            assistantResponse += tokens;
            session.sendTtsTokens(tokens).catch(console.error);
          } else if (event.type === 'message_stop') {
            session.flushTtsTokens();
            messages.push({ role: 'assistant', content: assistantResponse });
            assistantResponse = '';
          }
        }
      }
    })
    .on('tts:user_interrupt', () => {
      userInterrupt = true;
    });

  session
    .config({
      ttsStream: { enable: true },
      bargeIn: {
        enable: true,
        sticky: true,
        minBargeinWordCount: 1,
        actionHook: '/speech-detected',
        input: ['speech'],
      },
    })
    .say({ text: 'Hi there, how can I help you today?' })
    .send();
});
```

### Example (JavaScript)

```javascript
const Anthropic = require('@anthropic-ai/sdk');
const http = require('node:http');
const { createEndpoint } = require('@jambonz/sdk/websocket');

const server = http.createServer();
const makeService = createEndpoint({ server, port: 3000 });
const svc = makeService({ path: '/' });

svc.on('session:new', (session) => {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const messages = [];
  let assistantResponse = '';
  let userInterrupt = false;

  session
    .on('/speech-detected', async (evt) => {
      const { speech } = evt;
      session.reply();

      if (speech?.is_final) {
        const { transcript } = speech.alternatives[0];
        messages.push({ role: 'user', content: transcript });
        userInterrupt = false;

        const stream = await client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: 'You are a helpful voice assistant. Keep answers concise.',
          messages,
          stream: true,
        });

        for await (const event of stream) {
          if (userInterrupt) {
            messages.push({ role: 'assistant', content: `${assistantResponse}...` });
            assistantResponse = '';
            break;
          }
          if (event.delta?.text) {
            const tokens = event.delta.text;
            assistantResponse += tokens;
            session.sendTtsTokens(tokens).catch(console.error);
          } else if (event.type === 'message_stop') {
            session.flushTtsTokens();
            messages.push({ role: 'assistant', content: assistantResponse });
            assistantResponse = '';
          }
        }
      }
    })
    .on('tts:user_interrupt', () => {
      userInterrupt = true;
    });

  session
    .config({
      ttsStream: { enable: true },
      bargeIn: {
        enable: true,
        sticky: true,
        minBargeinWordCount: 1,
        actionHook: '/speech-detected',
        input: ['speech'],
      },
    })
    .say({ text: 'Hi there, how can I help you today?' })
    .send();
});
```

See the `examples/llm-streaming/` directory for the complete working example.
