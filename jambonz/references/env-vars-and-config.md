# Application Environment Variables

jambonz has a built-in mechanism for application configuration that is **always preferred over `process.env`**. It lets administrators configure values (API keys, phone numbers, language preferences, greetings, etc.) through the jambonz portal UI, and delivers those values to your app at runtime.

## The Two-Step Pattern

Both steps are **required**:

1. **Declare** — Your app declares its configurable parameters with a schema. The jambonz portal discovers these via an HTTP `OPTIONS` request and renders a configuration form.
2. **Read** — When a call arrives, jambonz delivers the configured values in the call payload as `env_vars`. Your app reads them from there.

If you only declare without reading, values are ignored. If you only read without declaring, the portal won't discover the parameters and won't send them.

## Step 1: Define the Schema

```typescript
const envVars = {
  API_KEY: { type: 'string', description: 'Your API key', required: true, obscure: true },
  LANGUAGE: { type: 'string', description: 'TTS language', default: 'en-US', enum: ['en-US', 'es-ES', 'fr-FR'] },
  MAX_RETRIES: { type: 'number', description: 'Max retry attempts', default: 3 },
  CARRIER: { type: 'string', description: 'Outbound carrier', jambonzResource: 'carriers' },
  SYSTEM_PROMPT: { type: 'string', description: 'LLM system prompt', uiHint: 'textarea' },
};
```

### Schema Properties

| Property | Required | Description |
|----------|----------|-------------|
| `type` | Yes | `'string'`, `'number'`, or `'boolean'` |
| `description` | Yes | Human-readable label shown in the portal |
| `required` | No | Whether the user must provide a value |
| `default` | No | Pre-filled default value |
| `enum` | No | Array of allowed values — renders as a dropdown |
| `obscure` | No | Masks the value in the portal UI (for secrets/API keys) |
| `uiHint` | No | `'input'` (default), `'textarea'` (multi-line), or `'filepicker'` (file upload) |
| `jambonzResource` | No | Populate dropdown from jambonz data. Supports `'carriers'` (lists VoIP carriers) |

## Step 2: Register and Read

### WebSocket Apps

Pass `envVars` to `createEndpoint`. Read from `session.data.env_vars`:

```typescript
import http from 'http';
import { createEndpoint } from '@jambonz/sdk/websocket';

const envVars = {
  GREETING: { type: 'string', description: 'Greeting message', default: 'Hello!' },
  LANGUAGE: { type: 'string', description: 'TTS language', default: 'en-US' },
};

const server = http.createServer();
const makeService = createEndpoint({ server, port: 3000, envVars });  // Declare

const svc = makeService({ path: '/' });

svc.on('session:new', (session) => {
  const greeting = session.data.env_vars?.GREETING || 'Hello!';       // Read
  const language = session.data.env_vars?.LANGUAGE || 'en-US';

  session.say({ text: greeting, language }).hangup().send();
});
```

### Webhook Apps

Use `envVarsMiddleware`. Read from `req.body.env_vars`:

```typescript
import express from 'express';
import { WebhookResponse, envVarsMiddleware } from '@jambonz/sdk/webhook';

const envVars = {
  GREETING: { type: 'string', description: 'Greeting message', default: 'Hello!' },
  LANGUAGE: { type: 'string', description: 'TTS language', default: 'en-US' },
};

const app = express();
app.use(express.json());
app.use(envVarsMiddleware(envVars));                                    // Declare

app.post('/incoming', (req, res) => {
  const greeting = req.body.env_vars?.GREETING || 'Hello!';            // Read
  const language = req.body.env_vars?.LANGUAGE || 'en-US';

  const jambonz = new WebhookResponse();
  jambonz.say({ text: greeting, language }).hangup();
  res.json(jambonz);
});
```

### Without the SDK (any language)

For non-TypeScript apps, respond to HTTP `OPTIONS` requests on your webhook URL with a JSON body containing the env var schema. jambonz will discover the parameters and render the portal form. Read values from `env_vars` in the POST body.

## Critical Gotcha: env_vars Only on Initial Call

**`env_vars` is only present in the initial call webhook (or `session:new` for WebSocket).** It is NOT included in subsequent actionHook callbacks.

If you need env var values in actionHook handlers:
- **WebSocket**: Store them in `session.locals` during `session:new`
- **Webhook**: Store them in a session store (e.g. in-memory map keyed by `call_sid`) during the initial POST

```typescript
// WebSocket — store on session
svc.on('session:new', (session) => {
  session.locals.apiKey = session.data.env_vars?.API_KEY;
  session.locals.language = session.data.env_vars?.LANGUAGE || 'en-US';
  // Now available in all actionHook handlers via session.locals
});
```

## When to Use env_vars vs Hardcoded Values

**Use env_vars for**: Phone numbers, API keys, language/voice preferences, greeting text, queue names, timeout values, feature flags, carrier selection, system prompts — anything that might change between deployments or users.

**Hardcode only**: Constants that are truly part of the application logic and would never change per-deployment (e.g. the structure of a menu, the actionHook path names).

When in doubt, make it an env var. It costs nothing and makes the app more flexible.
