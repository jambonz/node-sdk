# Call Queue with Hold Music

A support queue application. Callers are placed in a queue with hold music and position announcements. Agents connect separately to dequeue and bridge to the next waiting caller.

## What It Demonstrates
- The `enqueue` verb to place callers in a named queue
- The `waitHook` for hold music and queue position announcements
- The `dequeue` verb to connect agents with waiting callers
- Two separate endpoints: one for callers, one for agents

## Prerequisites
- A jambonz account with two applications configured:
  - Caller-facing application pointing to `/incoming`
  - Agent-facing application pointing to `/agent`
- A hold music audio file URL (replace the example URL in the code)

## Files
- `app.ts` — Webhook version (TypeScript using `@jambonz/sdk`)
- `ws-app.ts` — WebSocket version (TypeScript using `@jambonz/sdk`)
