# IVR Menu

A classic interactive voice response menu that routes callers based on DTMF or speech input.

## What It Demonstrates
- The `gather` verb with nested `say` prompt
- Handling DTMF digit input
- Handling speech input
- Routing to different handlers based on user input
- Using `actionHook` to receive gather results and return new verbs
- Fallback when no input is received (timeout)

## Files
- `app.js` — Plain JavaScript with Express
- `app.ts` — TypeScript using `@jambonz/sdk` WebhookResponse builder
