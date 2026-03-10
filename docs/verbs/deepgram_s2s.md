## Deepgram Voice Agent configuration

See [Deepgram Voice Agent Settings documentation](https://developers.deepgram.com/docs/voice-agent-settings) for the full configuration reference.

The Deepgram Voice Agent API does **not** have its own LLM — it delegates to an external LLM provider (OpenAI, Anthropic, etc.) via a "think" provider. The `model` property on the verb is **not used**. Instead, all configuration goes inside `llmOptions.Settings`.

### Required structure

The `llmOptions` must contain a `Settings` object with this structure:

```json
{
  "verb": "deepgram_s2s",
  "auth": { "apiKey": "your-deepgram-api-key" },
  "llmOptions": {
    "Settings": {
      "agent": {
        "think": {
          "provider": {
            "type": "open_ai",
            "model": "gpt-4o"
          },
          "prompt": "You are a helpful customer service agent."
        },
        "speak": {
          "provider": {
            "type": "deepgram",
            "model": "aura-2-thalia-en"
          }
        }
      }
    }
  },
  "actionHook": "/agent-complete"
}
```

### Key differences from other s2s verbs

- **No top-level `model`** — the LLM model is inside `Settings.agent.think.provider.model`
- **No `messages` array** — the system prompt goes in `Settings.agent.think.prompt`
- **Think provider `type`** — use `"open_ai"` (with underscore), `"anthropic"`, `"groq"`, etc.
- **Speak provider** — controls the TTS voice. Use `"deepgram"` type with an Aura model name like `"aura-2-thalia-en"`
- **Do NOT confuse Deepgram TTS voice names (e.g. `aura-asteria-en`) with LLM model names** — they are completely different

### Common think provider types

| type | Example models |
|------|---------------|
| `open_ai` | `gpt-4o`, `gpt-4o-mini` |
| `anthropic` | `claude-sonnet-4-20250514` |
| `groq` | `llama-3.3-70b-versatile` |

### SDK example

```typescript
session
  .deepgram_s2s({
    auth: { apiKey: deepgramApiKey },
    llmOptions: {
      Settings: {
        agent: {
          think: {
            provider: { type: 'open_ai', model: 'gpt-4o' },
            prompt: 'You are a helpful assistant.',
          },
          speak: {
            provider: { type: 'deepgram', model: 'aura-2-thalia-en' },
          },
        },
      },
    },
    actionHook: '/agent-complete',
  })
  .send();
```

### Tool/function support

Deepgram Voice Agent supports function calling. Define functions in `Settings.agent.think.functions`:

```json
{
  "Settings": {
    "agent": {
      "think": {
        "provider": { "type": "open_ai", "model": "gpt-4o" },
        "prompt": "You help users check order status.",
        "functions": [
          {
            "name": "check_order",
            "description": "Look up an order by ID",
            "parameters": {
              "type": "object",
              "properties": {
                "order_id": { "type": "string" }
              },
              "required": ["order_id"]
            }
          }
        ]
      }
    }
  }
}
```

Function call results are returned via the `toolHook` webhook or WebSocket `llm:tool-call` event.
