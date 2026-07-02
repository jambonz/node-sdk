# Conference Supervision

Monitor, coach, and barge into live conferences, and tap a room's audio for
transcription — the core patterns behind a call-center supervision tool,
distilled into two small files.

A complete reference application built on these patterns (React console,
diarized live transcript, closed-loop e2e tests) is at
https://github.com/jambonz/room-monitor — see its `docs/ADAPTING.md`.

## What It Demonstrates

- **Tagging members** — `memberTag: 'agent'` at join, and mid-call
  `tag`/`untag` via `injectCommand('conf:participant-action', ...)`
- **The supervisor leg** — one conference member whose join options and
  participant actions produce three modes: silent monitor (`joinMuted`),
  coach (audio delivered only to `agent`-tagged members), and barge-in
- **Mid-call mode switching** — `conferenceParticipantAction`
  (`coach`/`uncoach`) + `conf_mute_status` via the REST client: no re-dial,
  the room is never interrupted
- **Conference listen fork** — jambonz streams the room's mixed audio (L16
  PCM) to your WebSocket for transcription/AI; your `metadata` arrives
  verbatim as the fork's first text frame
- **Application env vars** — the caller flow's room name (`ROOM_NAME`) is
  declared via OPTIONS discovery so operators edit it from the jambonz portal

## Prerequisites

- A jambonz account with API credentials
- Three applications pointed at this app's paths (or one application and
  custom `X-` headers — see the reference app): `/caller`, `/agent`,
  `/supervisor`
- Conference-level listen (`/Conferences/{name}/listen`) requires a jambonz
  release with MediaJam-based conferencing that includes it

## Environment Variables

- `JAMBONZ_BASE_URL` — jambonz API URL (default: `https://api.jambonz.us`)
- `JAMBONZ_ACCOUNT_SID` — your account SID
- `JAMBONZ_API_KEY` — your API key
- `FORK_URL` — public ws(s):// URL of this app's `/fork` path (the media
  server dials out to it)

## Files

- `ws-app.ts` — the jambonz application: caller/agent/supervisor call flows +
  the audio-fork sink
- `monitor.ts` — REST-side supervision driver: list live rooms, switch the
  supervisor's mode (monitor → coach → barge), tag/untag a participant,
  start/stop the transcription fork

## Try It

```bash
npm install @jambonz/sdk tsx
npx tsx ws-app.ts        # the application (port 3000)
npx tsx monitor.ts       # walk a live room through the supervision modes
```

Place two calls into a room (one via `/agent`, one via `/caller`), then run
`monitor.ts` with the supervisor's call_sid to step through the modes.
