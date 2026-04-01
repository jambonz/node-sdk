## Overview

The pipeline verb orchestrates a complete voice AI agent by wiring together three separate components — STT, LLM, and TTS — with integrated turn detection. Unlike the s2s verbs (where a single vendor handles everything), pipeline lets you mix and match: e.g. Deepgram for STT, Anthropic for the LLM, and Cartesia for TTS.

Pipeline manages the full conversational turn cycle:
1. User speaks → STT produces a transcript
2. Turn detection decides the user is done speaking
3. Transcript is sent to the LLM
4. LLM response tokens stream to TTS
5. TTS audio plays back to the caller
6. If the user barges in, TTS stops and a new turn begins

## Turn detection

The `turnDetection` property controls how the pipeline decides the user has finished speaking.

**`"stt"` (default)** — Uses the STT vendor's native end-of-utterance signal. For most vendors this is silence-based. Some vendors have smarter built-in turn detection:
- **deepgramflux** — Acoustic + semantic turn detection (Deepgram's "Flux" model)
- **assemblyai** — Native turn-taking with `u3-rt-pro` model
- **speechmatics** — Built-in turn detection

These vendors always use their native detection regardless of the `turnDetection` setting.

**`"krisp"`** — Uses the Krisp acoustic end-of-turn model, which analyzes speech patterns rather than just silence. Good for natural conversation where users pause mid-thought. Can be tuned:

```json
{
  "turnDetection": {
    "mode": "krisp",
    "threshold": 0.3
  }
}
```

Lower threshold = faster turn transitions (more aggressive). Default is 0.5.

**IMPORTANT NOTE**: you must have a krisp API key in order to utilize this module on a self-hosted jambonz system.  Please contact us at support@jambonz.org if you need more details.

## Early generation (speculative preflight)

Early generation speculatively sends the transcript to the LLM *before* end-of-turn is confirmed. If the transcript matches when the turn does end, buffered tokens are released immediately — shaving off the LLM prompt time. If the user keeps talking and the transcript changes, the speculative response is discarded. This is a latency optimization with no correctness downside.

There are two ways early generation is triggered:

- **Krisp turn detection** — Set `earlyGeneration: true` to opt in. Krisp emits an early signal that triggers the speculative LLM prompt before final end-of-turn confirmation.
- **Deepgram Flux** — Early generation happens automatically. Flux emits a native `EagerEndOfTurn` event that triggers preflight regardless of the `earlyGeneration` setting.

For other STT vendors with native turn-taking (assemblyai, speechmatics), early generation is not available — they don't emit a preflight signal.

## Noise isolation

The `noiseIsolation` property enables server-side noise cancellation on the caller's audio, improving STT accuracy in noisy environments. Two vendors are available:

- **`"krisp"`** — Krisp's proprietary noise cancellation. Requires a Krisp API key on self-hosted systems.
- **`"rnnoise"`** — Open-source RNNoise-based noise cancellation. No API key required.

Shorthand (default settings):

```json
{
  "noiseIsolation": "krisp"
}
```

Detailed configuration:

```json
{
  "noiseIsolation": {
    "mode": "krisp",
    "level": 80,
    "direction": "read"
  }
}
```

- `mode` — Vendor: `"krisp"` or `"rnnoise"`.
- `level` — Suppression level 0–100. Higher values are more aggressive. Default: 100.
- `direction` — `"read"` filters caller audio (default), `"write"` filters outbound audio.
- `model` — Optional model name override.

Noise isolation can also be enabled/disabled mid-call via the `config` verb, the REST LCC API, or a WebSocket inject command (`noiseIsolation:status`).

## Barge-in

By default, users can interrupt the assistant while it's speaking. The `bargeIn` object controls this:

```json
{
  "bargeIn": {
    "enable": true,
    "minSpeechDuration": 0.5,
    "sticky": false
  }
}
```

- `minSpeechDuration` — Seconds of speech required to confirm an interruption. Prevents brief noises from cutting off the assistant. Default: 0.5.
- `sticky` — If true, once the user interrupts, the assistant does not resume speaking the interrupted response.

## eventHook events

The `eventHook` receives real-time events during the conversation. In WebSocket mode, listen for these with `session.on('/your-event-hook', handler)`.

| Event type | Description | Key fields |
|---|---|---|
| `user_transcript` | User speech recognized | `transcript` |
| `agent_response` | Assistant reply text | `response` |
| `user_interruption` | User barged in | — |
| `turn_end` | End-of-turn summary | `transcript`, `response`, `interrupted`, `latency` |

The `turn_end` event is the most useful for observability. It includes per-component latency metrics (STT, LLM, TTS) in milliseconds. See the `callback:pipeline-turn` schema for the full payload structure.

## toolHook (function calling)

When the LLM requests a tool/function call, the pipeline sends a request to the `toolHook` with:

```json
{
  "tool_call_id": "call_abc123",
  "name": "get_weather",
  "arguments": { "city": "Portland" }
}
```

The `arguments` field is already parsed (an object, not a JSON string).

**Webhook response**: Return the tool result in the HTTP response body as JSON. The result is stringified and fed back to the LLM.

**WebSocket**: The tool call arrives as an event on the hook path. Respond by calling `session.toolOutput(tool_call_id, result).reply()`.

## MCP servers (external tools)

Instead of (or in addition to) defining tools inline via `llmOptions.tools` and handling them with `toolHook`, you can connect to external MCP servers. The pipeline connects to each server at startup via SSE transport, discovers available tools, and makes them available to the LLM alongside any inline tools.

```json
{
  "verb": "pipeline",
  "mcpServers": [
    {
      "url": "https://livescoremcp.com/sse"
    }
  ],
  "llm": {
    "vendor": "openai",
    "model": "gpt-4.1",
    "llmOptions": {
      "messages": [
        { "role": "system", "content": "You are a sports assistant. Use available tools to look up live scores and fixtures when asked." }
      ]
    }
  },
  "stt": { "vendor": "deepgram", "language": "en-US" },
  "tts": { "vendor": "cartesia", "voice": "sonic-english" }
}
```

The [LiveScore MCP server](https://livescoremcp.com/) is a free, public MCP server that exposes tools for live football scores, fixtures, team stats, and player data. The pipeline discovers these tools automatically at startup — no need to define tool schemas in `llmOptions.tools`. A caller can simply ask "what football matches are on right now?" and the LLM will use the `get_live_scores` tool to fetch real-time data.

If an MCP server requires authentication, pass credentials in the `auth` property:

```json
{
  "mcpServers": [
    {
      "url": "https://mcp.example.com/sse",
      "auth": {
        "apiKey": "your-api-key-here"
      }
    }
  ]
}
```

**How tool dispatch works**: When the LLM requests a tool call, the pipeline checks MCP servers first. If the tool name matches one discovered from an MCP server, the call is dispatched there directly and the result is fed back to the LLM. If no MCP server provides the tool, it falls through to the `toolHook` webhook. You can use both MCP servers and `toolHook` together — MCP handles the tools it knows about, and `toolHook` handles the rest.

**TypeScript example** — a pipeline agent with the LiveScore MCP server:

```typescript
session
  .pipeline({
    stt: { vendor: 'deepgram', language: 'en-US' },
    tts: { vendor: 'cartesia', voice: 'sonic-english' },
    llm: {
      vendor: 'openai',
      model: 'gpt-4.1',
      llmOptions: {
        messages: [
          { role: 'system', content: 'You are a sports assistant. Use available tools to answer questions about football scores, fixtures, and teams.' },
        ],
      },
    },
    mcpServers: [
      { url: 'https://livescoremcp.com/sse' },
      // To use a server that requires auth:
      // { url: 'https://mcp.example.com/sse', auth: { apiKey: 'your-key' } },
    ],
    turnDetection: 'krisp',
    actionHook: '/pipeline-complete',
  })
  .send();
```

## LLM configuration

The `llm` property is the only required field. It configures the text-to-text LLM:

```json
{
  "llm": {
    "vendor": "openai",
    "model": "gpt-4.1",
    "llmOptions": {
      "messages": [
        { "role": "system", "content": "You are a helpful voice assistant." }
      ],
      "tools": [
        {
          "type": "function",
          "function": {
            "name": "get_weather",
            "description": "Get current weather for a city",
            "parameters": {
              "type": "object",
              "properties": {
                "city": { "type": "string" }
              },
              "required": ["city"]
            }
          }
        }
      ]
    }
  }
}
```

For Anthropic models, use `"vendor": "anthropic"` and structure messages accordingly (Anthropic uses `"role": "user"` for the system-level instruction).

## Greeting

By default (`greeting: true`), the pipeline prompts the LLM to generate an initial greeting before the user speaks. Set `greeting: false` if you want the agent to wait silently for the user to speak first.

## Complete example (TypeScript)

A pipeline voice agent using Deepgram STT, OpenAI LLM, and Cartesia TTS with Krisp turn detection. Exposes multiple endpoints with different STT/TTS combinations:

```typescript
import * as http from 'node:http';
import { createEndpoint, Session } from '@jambonz/sdk/websocket';

const envVars = {
  OPENAI_MODEL: {
    type: 'string' as const,
    description: 'OpenAI model to use',
    default: 'gpt-4.1-mini',
  },
  SYSTEM_PROMPT: {
    type: 'string' as const,
    description: 'System prompt for the voice agent',
    uiHint: 'textarea' as const,
    default: 'You are a helpful voice AI assistant. Your responses are concise and conversational.',
  },
};

function handleSession(session: Session) {
  const model = session.data.env_vars?.OPENAI_MODEL || 'gpt-4.1-mini';
  const systemPrompt = session.data.env_vars?.SYSTEM_PROMPT || envVars.SYSTEM_PROMPT.default;

  session.on('/pipeline-event', (evt: Record<string, unknown>) => {
    if (evt.type === 'turn_end') {
      const { transcript, response, interrupted, latency } = evt as Record<string, unknown>;
      console.log('turn_end', JSON.stringify({ transcript, response, interrupted, latency }, null, 2));
    }
  });

  session.on('/pipeline-complete', () => {
    session.hangup().reply();
  });

  session
    .pipeline({
      stt: {
        vendor: 'deepgram',
        language: 'multi',
        deepgramOptions: { model: 'nova-3-general' },
      },
      tts: {
        vendor: 'cartesia',
        voice: '9626c31c-bec5-4cca-baa8-f8ba9e84c8bc',
      },
      llm: {
        vendor: 'openai',
        model,
        llmOptions: {
          messages: [{ role: 'system', content: systemPrompt }],
        },
      },
      turnDetection: 'krisp',
      earlyGeneration: true,
      bargeIn: { enable: true },
      eventHook: '/pipeline-event',
      actionHook: '/pipeline-complete',
    })
    .send();
}

const port = parseInt(process.env.PORT || '3000', 10);
const server = http.createServer();
const makeService = createEndpoint({ server, port, envVars });

const svc = makeService({ path: '/' });
svc.on('session:new', (session) => handleSession(session));
```

## Complete example (JavaScript)

The same agent in plain JavaScript:

```javascript
const http = require('node:http');
const { createEndpoint } = require('@jambonz/sdk/websocket');

const envVars = {
  OPENAI_MODEL: {
    type: 'string',
    description: 'OpenAI model to use',
    default: 'gpt-4.1-mini',
  },
  SYSTEM_PROMPT: {
    type: 'string',
    description: 'System prompt for the voice agent',
    uiHint: 'textarea',
    default: 'You are a helpful voice AI assistant. Your responses are concise and conversational.',
  },
};

function handleSession(session) {
  const model = session.data.env_vars?.OPENAI_MODEL || 'gpt-4.1-mini';
  const systemPrompt = session.data.env_vars?.SYSTEM_PROMPT || envVars.SYSTEM_PROMPT.default;

  session.on('/pipeline-event', (evt) => {
    if (evt.type === 'turn_end') {
      const { transcript, response, interrupted, latency } = evt;
      console.log('turn_end', JSON.stringify({ transcript, response, interrupted, latency }, null, 2));
    }
  });

  session.on('/pipeline-complete', () => {
    session.hangup().reply();
  });

  session
    .pipeline({
      stt: {
        vendor: 'deepgram',
        language: 'multi',
        deepgramOptions: { model: 'nova-3-general' },
      },
      tts: {
        vendor: 'cartesia',
        voice: '9626c31c-bec5-4cca-baa8-f8ba9e84c8bc',
      },
      llm: {
        vendor: 'openai',
        model,
        llmOptions: {
          messages: [{ role: 'system', content: systemPrompt }],
        },
      },
      turnDetection: 'krisp',
      earlyGeneration: true,
      bargeIn: { enable: true },
      eventHook: '/pipeline-event',
      actionHook: '/pipeline-complete',
    })
    .send();
}

const port = parseInt(process.env.PORT || '3000', 10);
const server = http.createServer();
const makeService = createEndpoint({ server, port, envVars });

const svc = makeService({ path: '/' });
svc.on('session:new', (session) => handleSession(session));

console.log(`jambonz voice agent listening on port ${port}`);
```
