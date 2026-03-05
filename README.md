# jambonz Agent Toolkit

Build voice applications on [jambonz](https://jambonz.org) with AI-assisted development.

This monorepo contains two packages:

| Package | Description |
|---------|-------------|
| [`@jambonz/sdk`](typescript/) | TypeScript SDK for building jambonz webhook and WebSocket voice applications |
| [`@jambonz/mcp-schema-server`](mcp-server/) | MCP server that gives AI coding assistants deep knowledge of jambonz APIs |

## Quick Start

```bash
npm install @jambonz/sdk
```

### Webhook app (Express)

```typescript
import express from 'express';
import { WebhookResponse } from '@jambonz/sdk/webhook';

const app = express();
app.use(express.json());

app.post('/incoming', (req, res) => {
  const jambonz = new WebhookResponse();
  jambonz
    .say({ text: 'Hello from jambonz!' })
    .gather({
      input: ['speech', 'digits'],
      actionHook: '/handle-input',
      say: { text: 'Press 1 for sales or 2 for support.' },
    })
    .hangup();

  res.json(jambonz);
});

app.listen(3000);
```

### WebSocket app

```typescript
import http from 'http';
import { createEndpoint } from '@jambonz/sdk/websocket';

const server = http.createServer();
const makeService = createEndpoint({ server, port: 3000 });

const svc = makeService({ path: '/' });

svc.on('session:new', (session) => {
  session
    .on('/gather-result', (evt) => {
      const transcript = evt.speech?.alternatives?.[0]?.transcript || '';
      session.say({ text: `You said: ${transcript}` }).hangup().reply();
    });

  session
    .say({ text: 'Hello! Say something.' })
    .gather({ input: ['speech'], actionHook: '/gather-result', timeout: 10 })
    .hangup()
    .send();
});
```

### Handling audio streams (listen/stream verb)

When you use a [`listen`](https://docs.jambonz.org/verbs/verbs/listen) or [`stream`](https://docs.jambonz.org/verbs/verbs/stream) verb, jambonz opens a separate WebSocket connection to deliver real-time call audio. The audio WebSocket URL can point anywhere — a separate server, a different process, or a third-party service.

However, if you want to handle both the call control and the audio stream in a single application, `makeService.audio()` lets you register an audio WebSocket handler on the same server as the control pipe:

```typescript
import http from 'http';
import { createEndpoint } from '@jambonz/sdk/websocket';

const server = http.createServer();
const makeService = createEndpoint({ server, port: 3000 });

// Control pipe — handles call sessions
const svc = makeService({ path: '/' });

// Audio pipe — receives audio from listen/stream verbs
const audioSvc = makeService.audio({ path: '/audio-stream' });

svc.on('session:new', (session) => {
  session
    .say({ text: 'Listening...' })
    .listen({
      url: '/audio-stream',  // relative path — jambonz connects back to same server
      sampleRate: 8000,
      bidirectionalAudio: {
        enabled: true,
        streaming: true,
        sampleRate: 8000,
      },
    })
    .send();
});

audioSvc.on('connection', (stream) => {
  console.log(`Audio connected: ${stream.callSid} @ ${stream.sampleRate}Hz`);

  // Receive audio (L16 PCM binary frames)
  stream.on('audio', (pcm: Buffer) => {
    // Process audio — e.g. feed to an STT engine
  });

  // Send audio back (streaming mode — raw binary PCM)
  stream.sendAudio(pcmBuffer);

  // Or send audio back (non-streaming mode — base64-encoded file)
  stream.playAudio(base64Content, {
    audioContentType: 'raw',  // or 'wav'
    sampleRate: 16000,
  });

  stream.on('close', () => console.log('Audio stream closed'));
});
```

The `AudioStream` object also provides `killAudio()`, `disconnect()`, `sendMark(name)`, and `clearMarks()` methods. See the [Audio WebSocket section in AGENTS.md](AGENTS.md#audio-websocket-listenstream) for full API details.

## AI-Assisted Development

The `@jambonz/mcp-schema-server` package is an [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that gives AI coding assistants — Claude, Cursor, GitHub Copilot, Windsurf, and others — deep knowledge of jambonz APIs, verb schemas, and SDK usage patterns. This means the AI can generate correct jambonz application code without you having to manually explain the API.

### What it provides

The MCP server exposes two tools to the AI:

1. **`jambonz_developer_toolkit`** — A comprehensive developer guide covering the SDK API, verb model, webhook/WebSocket transports, actionHook lifecycle, mid-call control, recording, and working code examples.
2. **`get_jambonz_schema`** — Full JSON Schema for any jambonz verb (`say`, `gather`, `dial`, `llm`, etc.), component (`recognizer`, `synthesizer`, `target`, etc.), or actionHook callback payload.

When you ask the AI to build a jambonz application, it calls these tools automatically to get the context it needs.

### Setup

Choose the setup that matches your development environment. You only need one.

#### Claude Code (CLI)

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "jambonz": {
      "command": "npx",
      "args": ["-y", "@jambonz/mcp-schema-server"]
    }
  }
}
```

Or run interactively:

```bash
claude mcp add jambonz -- npx -y @jambonz/mcp-schema-server
```

#### Claude Desktop

Open **Settings > Developer > Edit Config** and add to `mcpServers`:

```json
{
  "mcpServers": {
    "jambonz": {
      "command": "npx",
      "args": ["-y", "@jambonz/mcp-schema-server"]
    }
  }
}
```

Restart Claude Desktop after saving.

#### Cursor

Open **Cursor Settings > MCP** and add a new server:

- **Name**: `jambonz`
- **Type**: `command`
- **Command**: `npx -y @jambonz/mcp-schema-server`

Or add to your project's `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "jambonz": {
      "command": "npx",
      "args": ["-y", "@jambonz/mcp-schema-server"]
    }
  }
}
```

#### VS Code (GitHub Copilot / Claude Extension)

Add to your workspace's `.vscode/mcp.json`:

```json
{
  "servers": {
    "jambonz": {
      "command": "npx",
      "args": ["-y", "@jambonz/mcp-schema-server"]
    }
  }
}
```

#### Windsurf

Open **Windsurf Settings > MCP** and add:

```json
{
  "mcpServers": {
    "jambonz": {
      "command": "npx",
      "args": ["-y", "@jambonz/mcp-schema-server"]
    }
  }
}
```

### Verifying it works

After configuring the MCP server, start a new conversation with your AI assistant and ask it to build a jambonz application. For example:

> "Create a jambonz WebSocket app that answers a call, asks for the caller's name using speech recognition, and greets them by name."

The AI should automatically call the `jambonz_developer_toolkit` tool, then generate correct code using `@jambonz/sdk` with proper `session.on()` actionHook handling, `.send()` for the initial verbs, and `.reply()` for subsequent responses.

If the AI generates code using the old `@jambonz/node-client-ws` package, raw JSON arrays without the SDK, or uses `.send()` where `.reply()` is needed, the MCP server is not connected. Check your configuration and restart the AI tool.

## API Documentation

Full API reference documentation is available at **[jambonz.github.io/node-sdk](https://jambonz.github.io/node-sdk/)**.

The reference covers all exported classes, methods, properties, and types — including [`Session`](https://jambonz.github.io/node-sdk/classes/index.Session.html), [`WebhookResponse`](https://jambonz.github.io/node-sdk/classes/index.WebhookResponse.html), [`AudioStream`](https://jambonz.github.io/node-sdk/classes/index.AudioStream.html), [`JambonzClient`](https://jambonz.github.io/node-sdk/classes/index.JambonzClient.html), and [`VerbBuilder`](https://jambonz.github.io/node-sdk/classes/index.VerbBuilder.html).

Docs are auto-generated from TSDoc comments in the source using [TypeDoc](https://typedoc.org) and deployed to GitHub Pages on every push to `main`. To generate locally: `cd typescript && npm run docs`.

## Testing

The SDK has a test suite built on [Vitest](https://vitest.dev/).

```bash
cd typescript
npm test              # run all tests once
npm run test:watch    # re-run on file changes
```

To generate a coverage report:

```bash
npx vitest run --coverage
```

Tests live in `typescript/test/` and cover the webhook response builder, signature verification, environment variable middleware, REST API client, JSON schema validation, and schema drift detection.

## SDK Reference

### Imports

```typescript
// Webhook apps (Express/HTTP)
import { WebhookResponse } from '@jambonz/sdk/webhook';

// WebSocket apps
import { createEndpoint } from '@jambonz/sdk/websocket';

// REST API client (mid-call control, outbound calls)
import { JambonzClient } from '@jambonz/sdk/client';
```

### Verb methods

Both `WebhookResponse` and WebSocket `Session` support the same chainable verb methods:

`.say()` `.play()` `.gather()` `.dial()` `.llm()` `.conference()` `.enqueue()` `.dequeue()` `.hangup()` `.pause()` `.redirect()` `.config()` `.tag()` `.dtmf()` `.listen()` `.transcribe()` `.message()` `.stream()` `.pipeline()` `.dub()` `.alert()` `.answer()` `.leave()` `.sipDecline()` `.sipRefer()` `.sipRequest()`

All methods accept the same options as the corresponding [verb JSON schemas](schema/verbs/) and are chainable.

### Webhook: sending responses

```typescript
const jambonz = new WebhookResponse();
jambonz.say({ text: 'Hello' }).hangup();
res.json(jambonz);  // Express response
```

### WebSocket: .send() vs .reply()

- **`.send()`** — Use once for the initial verb array in response to `session:new`.
- **`.reply()`** — Use for all subsequent responses to actionHook events.

```typescript
svc.on('session:new', (session) => {
  // Bind actionHook handlers first
  session.on('/my-hook', (evt) => {
    session.say({ text: 'Got it.' }).reply();  // .reply() for actionHooks
  });

  // Send initial verbs
  session.gather({ actionHook: '/my-hook', input: ['speech'] }).send();  // .send() once
});
```

### REST API client

```typescript
import { JambonzClient } from '@jambonz/sdk/client';

const client = new JambonzClient({ baseUrl: 'https://api.jambonz.us', accountSid, apiKey });

// Outbound call
await client.calls.create({
  from: '+15085551212',
  to: { type: 'phone', number: '+15085551213' },
  call_hook: '/incoming',
});

// Mid-call control
await client.calls.mute(callSid, 'mute');
await client.calls.redirect(callSid, 'https://example.com/new-flow');
```

## Examples

See the [examples/](examples/) directory:

| Example | Transport | Description |
|---------|-----------|-------------|
| [hello-world](examples/hello-world/) | Webhook + WS | Minimal greeting |
| [echo](examples/echo/) | Webhook + WS | Speech echo using gather with actionHook |
| [ivr-menu](examples/ivr-menu/) | Webhook | Interactive menu with speech and DTMF |
| [dial](examples/dial/) | Webhook | Outbound dial to a phone number |
| [listen-record](examples/listen-record/) | Webhook | Record audio via WebSocket stream |
| [voice-agent](examples/voice-agent/) | Webhook + WS | LLM-powered conversational AI with tool calls |
| [openai-realtime](examples/openai-realtime/) | WebSocket | OpenAI Realtime API voice agent |
| [deepgram-voice-agent](examples/deepgram-voice-agent/) | WebSocket | Deepgram Voice Agent API |
| [llm-streaming](examples/llm-streaming/) | WebSocket | Anthropic LLM with TTS streaming and barge-in |
| [queue-with-hold](examples/queue-with-hold/) | Webhook + WS | Call queue with hold music |
| [call-recording](examples/call-recording/) | Webhook + WS | Mid-call recording control |

## Publishing to npm

The two packages are versioned and published independently. Each has its own GitHub Actions workflow triggered by a specific tag pattern.

### Publishing `@jambonz/sdk`

```bash
cd typescript
npm version patch   # or minor, or major
cd ..
git add typescript/package.json typescript/package-lock.json
git commit -m "sdk v$(node -p \"require('./typescript/package.json').version\")"
git tag "v$(node -p \"require('./typescript/package.json').version\")"
git push && git push --tags
```

The `v*` tag triggers `.github/workflows/publish-sdk.yml`.

### Publishing `@jambonz/mcp-schema-server`

```bash
cd mcp-server
npm version patch   # or minor, or major
cd ..
git add mcp-server/package.json mcp-server/package-lock.json
git commit -m "mcp v$(node -p \"require('./mcp-server/package.json').version\")"
git tag "mcp-v$(node -p \"require('./mcp-server/package.json').version\")"
git push && git push --tags
```

The `mcp-v*` tag triggers `.github/workflows/publish-mcp.yml`.

**Note**: `npm version` bumps `package.json` but does not create a git commit when run from a monorepo subdirectory — you must commit and tag manually as shown above.

## Repository Structure

```
node-sdk/
├── typescript/          # @jambonz/sdk — the TypeScript SDK
├── mcp-server/          # @jambonz/mcp-schema-server — MCP server for AI assistants
├── schema/
│   ├── verbs/           # JSON Schema for each jambonz verb
│   ├── components/      # JSON Schema for shared types (recognizer, synthesizer, etc.)
│   └── callbacks/       # JSON Schema for actionHook callback payloads
├── examples/            # Working example applications
└── AGENTS.md            # Developer guide (served by the MCP server)
```

## License

MIT
