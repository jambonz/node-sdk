# Custom harness

A minimal jambonz **custom harness** built with `@jambonz/sdk/harness`. jambonz keeps the telephony, speech-to-text,
turn-taking, barge-in and text-to-speech; the harness decides what the agent says. jambonz opens one WebSocket to it
per call.

## What It Demonstrates
- `createHarness()` as a working pass-through to an OpenAI-compatible model, with no protocol code
- `beforeModel` routing each turn by keyword to a procedure with its own prompt and tools
- A tool of the harness's own (`lookup_outage`), run in-process; the agent's Studio tools would be offered to the model too
- `checkSentence` stopping a long number from being read aloud
- `onEvent.dtmf` sending a `transfer` command
- The built-in behaviour you get for free: history, streaming, barge-in trimming, the turn record, and the
  silence policy (ask once if the caller is still there, hang up after the second silence)

## Prerequisites
- Node.js 18+
- An OpenAI API key, or any OpenAI-compatible endpoint (set `OPENAI_BASE_URL`)
- A jambonz system with the Harness LLM vendor, and an application that uses the `agent` verb with `llm.vendor: "harness"`

## Run it

```bash
npm install
export OPENAI_API_KEY=sk-...
export HARNESS_API_KEY=$(openssl rand -hex 24)   # the key jambonz must present
npm start
```

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | port to listen on |
| `HARNESS_API_KEY` | unset (no auth) | when set, jambonz must send `Authorization: Bearer <key>` |
| `OPENAI_API_KEY` | | key for the model endpoint |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | any OpenAI-compatible chat-completions endpoint |
| `MODEL` | `gpt-4.1-mini` | model name |
| `OPERATOR_NUMBER` | unset | number to transfer to when the caller presses 0 |
| `LOG_LEVEL` | `info` | pino log level |

`GET /health` returns `{"ok":true,"calls":N}` for a load balancer or container health check.

> Until `@jambonz/sdk` with the `harness` subpath is published, build the SDK and install it from the repo:
> `(cd ../../typescript && npm ci && npm run build) && npm install ../../typescript`

## Point jambonz at it

1. Expose the harness where feature-server can reach it. In production put it behind TLS (a load balancer or a
   reverse proxy such as nginx/Caddy that passes WebSocket upgrades), so the URL is `wss://`.
2. In the jambonz portal (or Agent Studio), add an LLM credential with vendor **Harness**:
   - **URL**: `wss://harness.example.com` (or `ws://10.0.0.5:8080` on a private network)
   - **API key**: the value of `HARNESS_API_KEY`
3. Use it from an `agent` verb:

```json
{
  "verb": "agent",
  "stt": { "vendor": "deepgram", "language": "en-US" },
  "tts": { "vendor": "cartesia", "voice": "..." },
  "llm": { "vendor": "harness", "label": "my-harness", "harness": { "metadata": { "tenant": "acme" } } },
  "bargeIn": { "enable": true }
}
```

Each call logs `session started` with its `call_sid`; every log line for the call carries it, and every turn's
`reply:done` carries a turn record (route, steps with timings, model calls with tokens, own tools) that jambonz stores
on the turn.

## Files
- `harness.ts` — the harness
- `package.json`, `tsconfig.json` — a standalone project (`module: Node16`, pino for logging)
