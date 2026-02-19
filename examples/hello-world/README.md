# Hello World

The simplest jambonz application: answer a call, greet the caller, and hang up.

## What It Demonstrates
- Basic verb array structure
- The `say` verb
- The `hangup` verb

## Webhook Version
- `app.js` — Plain JavaScript with Express
- `app.ts` — TypeScript using `@jambonz/sdk` WebhookResponse builder

## WebSocket Version
- `ws-app.ts` — TypeScript using `@jambonz/sdk` createEndpoint + Session
