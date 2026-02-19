# Call Recording

Demonstrates mid-call recording control. An incoming call is bridged to an agent, and recording can be started/stopped dynamically during the call.

## What It Demonstrates
- The `dial` verb with `anchorMedia: true` (required for mid-call recording)
- **Webhook version**: Using the REST API client (`JambonzClient`) to whisper and mute active calls from an external endpoint
- **WebSocket version**: Using `injectRecord()` to start/stop SIPREC recording mid-call
- Asynchronous call control (modifying a call that's already in progress)

## Prerequisites
- A jambonz account with API credentials (for the webhook version's REST client)
- A SIPREC server URL (for the WebSocket version's recording destination)

## Environment Variables
- `JAMBONZ_BASE_URL` — jambonz API URL (default: `https://api.jambonz.us`)
- `JAMBONZ_ACCOUNT_SID` — your account SID
- `JAMBONZ_API_KEY` — your API key
- `AGENT_NUMBER` — phone number to bridge the caller to
- `SIPREC_URL` — SIP URI of the recording server (WebSocket version)

## Files
- `app.ts` — Webhook version with REST API control (TypeScript using `@jambonz/sdk`)
- `ws-app.ts` — WebSocket version with inject commands (TypeScript using `@jambonz/sdk`)
