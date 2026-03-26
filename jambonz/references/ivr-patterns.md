# IVR Patterns

This reference covers building interactive voice response (IVR) menus and collecting user input with the `gather` verb.

## Gather Basics

The `gather` verb collects input from the caller — speech (STT), DTMF digits, or both. It pauses execution, plays an optional prompt, waits for input, then fires the `actionHook` with the result.

```json
{
  "verb": "gather",
  "input": ["speech", "digits"],
  "actionHook": "/handle-input",
  "timeout": 10,
  "say": { "text": "Press 1 for sales or say 'sales'." }
}
```

Key properties (use `get_jambonz_schema('gather')` for the full schema):
- `input` — array: `["speech"]`, `["digits"]`, or `["speech", "digits"]`
- `actionHook` — where results go when input is collected
- `timeout` — seconds to wait for input (default varies by implementation)
- `say` or `play` — nested prompt that plays while waiting for input
- `numDigits` — for DTMF: how many digits to collect before firing
- `finishOnKey` — for DTMF: key that ends collection (e.g. `"#"`)

## ActionHook Result Handling

The gather actionHook payload includes:

| Field | Description |
|-------|-------------|
| `reason` | Why gather completed: `speechDetected`, `dtmfDetected`, `timeout` |
| `speech` | Object with `alternatives[].transcript` and `confidence` (when `reason` is `speechDetected`) |
| `digits` | String of collected digits (when `reason` is `dtmfDetected`) |

### WebSocket Example

```typescript
session.on('/handle-input', (evt) => {
  switch (evt.reason) {
    case 'speechDetected': {
      const transcript = evt.speech?.alternatives?.[0]?.transcript || '';
      // Process speech...
      session.say({ text: `You said: ${transcript}` }).reply();
      break;
    }
    case 'dtmfDetected': {
      const digit = evt.digits;
      // Process digit...
      session.say({ text: `You pressed ${digit}` }).reply();
      break;
    }
    case 'timeout':
      // No input received — retry or hang up
      session.say({ text: 'I didn\'t hear anything.' }).hangup().reply();
      break;
  }
});
```

### Webhook Example

```typescript
app.post('/handle-input', (req, res) => {
  const { reason, speech, digits } = req.body;
  const jambonz = new WebhookResponse();

  if (reason === 'speechDetected') {
    const transcript = speech?.alternatives?.[0]?.transcript || '';
    jambonz.say({ text: `You said: ${transcript}` });
  } else if (reason === 'dtmfDetected') {
    jambonz.say({ text: `You pressed ${digits}` });
  } else {
    jambonz.say({ text: 'I didn\'t hear anything. Goodbye.' }).hangup();
  }

  res.json(jambonz);
});
```

## Multi-Level Menu Pattern

Build nested menus by chaining gather → actionHook → new gather:

```typescript
// Main menu
session.on('/main-menu', (evt) => {
  if (evt.reason === 'dtmfDetected') {
    switch (evt.digits) {
      case '1':
        session
          .gather({
            input: ['digits'], numDigits: 1, actionHook: '/sales-menu', timeout: 10,
            say: { text: 'Press 1 for new orders, 2 for existing orders.' },
          })
          .reply();
        break;
      case '2':
        session
          .gather({
            input: ['digits'], numDigits: 1, actionHook: '/support-menu', timeout: 10,
            say: { text: 'Press 1 for billing, 2 for technical support.' },
          })
          .reply();
        break;
      default:
        // Invalid input — replay menu
        session
          .gather({
            input: ['digits'], numDigits: 1, actionHook: '/main-menu', timeout: 10,
            say: { text: 'Invalid choice. Press 1 for sales, 2 for support.' },
          })
          .reply();
    }
  } else {
    // Timeout — replay
    session
      .gather({
        input: ['digits'], numDigits: 1, actionHook: '/main-menu', timeout: 10,
        say: { text: 'Press 1 for sales, 2 for support.' },
      })
      .reply();
  }
});
```

## Timeout and Retry

To retry on timeout, simply issue a new `gather` in the timeout handler. Track retry count with `session.locals` (WebSocket) or pass it as a query parameter in the actionHook URL (webhook).

### WebSocket retry with session.locals

```typescript
session.on('/gather-input', (evt) => {
  if (evt.reason === 'timeout') {
    session.locals.retryCount = (session.locals.retryCount || 0) + 1;
    if (session.locals.retryCount >= 3) {
      session.say({ text: 'No input received. Goodbye.' }).hangup().reply();
    } else {
      session
        .gather({
          input: ['speech'], actionHook: '/gather-input', timeout: 10,
          say: { text: 'I didn\'t hear anything. Please try again.' },
        })
        .reply();
    }
  } else {
    session.locals.retryCount = 0;
    // Process input...
    session.reply();
  }
});
```

## Setting Default Recognizer / Synthesizer

Use the `config` verb at the start of the call to set session-wide TTS and STT defaults. This avoids repeating vendor/voice/language on every `say` and `gather`.

```typescript
session
  .config({
    synthesizer: { vendor: 'elevenlabs', voice: 'EXAVITQu4vr4xnSDxMaL', language: 'en-US' },
    recognizer: { vendor: 'deepgram', language: 'en-US' },
  })
  .gather({
    input: ['speech'],
    actionHook: '/result',
    timeout: 10,
    say: { text: 'How can I help you today?' },  // Uses ElevenLabs Rachel
  })
  .send();
```

Look up available recognizer and synthesizer options: `get_jambonz_schema('recognizer')`, `get_jambonz_schema('synthesizer')`

## Mixed Input (Speech + DTMF)

When `input` includes both `["speech", "digits"]`, gather will fire on whichever arrives first. Check `evt.reason` to determine which type was received.

This is useful for accessibility — let callers speak OR press buttons:

```json
{
  "verb": "gather",
  "input": ["speech", "digits"],
  "numDigits": 1,
  "actionHook": "/menu",
  "timeout": 10,
  "say": { "text": "Say 'sales' or press 1. Say 'support' or press 2." }
}
```
