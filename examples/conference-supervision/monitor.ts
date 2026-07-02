import { JambonzClient } from '@jambonz/sdk/client';

/*
 * Conference supervision — the REST-side driver.
 *
 * Walks a live room through the supervision modes using mid-call commands on
 * the supervisor's existing leg (started via ws-app.ts /supervisor). Nothing
 * here re-dials or interrupts the room.
 *
 * Usage:
 *   JAMBONZ_ACCOUNT_SID=... JAMBONZ_API_KEY=... \
 *     npx tsx monitor.ts <supervisor_call_sid> [room_name]
 */

const baseUrl = process.env.JAMBONZ_BASE_URL || 'https://api.jambonz.us';
const accountSid = process.env.JAMBONZ_ACCOUNT_SID || '';
const apiKey = process.env.JAMBONZ_API_KEY || '';
const forkUrl = process.env.FORK_URL || 'wss://your-host/fork';

const supervisorCallSid = process.argv[2];
const roomName = process.argv[3] || 'support-room';
if (!accountSid || !apiKey || !supervisorCallSid) {
  console.error('usage: JAMBONZ_ACCOUNT_SID=.. JAMBONZ_API_KEY=.. npx tsx monitor.ts <supervisor_call_sid> [room]');
  process.exit(1);
}

const client = new JambonzClient({ baseUrl, accountSid, apiKey });
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* -- discovery: what rooms are live? --------------------------------------- */
const conferences = await client.conferences.list();
console.log('live conferences:', conferences);

// On releases with the enriched listing, get participants + tags in one call:
//   GET /Accounts/{sid}/Conferences?expand=participants
//   → [{ id, name, durationSec, participants: [{ call_sid, label, memberTag, isAgent }] }]
// Derive agent counts (and whether Coach should be offered) from memberTag,
// and filter out memberTag === 'supervisor' legs before displaying counts.

/* -- transcription tap: stream the room mix to our websocket --------------- */
// jambonz only transports audio — the consumer (ws-app.ts /fork) decides what
// to do with it. The fork needs no participant leg, is excluded from counts,
// and is torn down automatically when the room ends.
const res = await fetch(
  `${baseUrl}/v1/Accounts/${accountSid}/Conferences/${encodeURIComponent(roomName)}/listen`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: forkUrl,
      sampleRate: 16000,
      metadata: { room: roomName, sampleRate: 16000 }, // delivered verbatim to the sink
    }),
  });
console.log(`listen fork: ${res.status}`);

/* -- the three supervision modes, as mid-call commands --------------------- */

// COACH: audio delivered only to members tagged 'agent'; the caller — and the
// audio fork — cannot hear it
console.log('coach mode: only agents hear the supervisor');
await client.calls.update(supervisorCallSid, {
  conferenceParticipantAction: { action: 'coach', tag: 'agent' },
});
await client.calls.update(supervisorCallSid, { conf_mute_status: 'unmute' });
await pause(10000);

// BARGE-IN: heard by everyone
console.log('barge-in: everyone hears the supervisor');
await client.calls.update(supervisorCallSid, {
  conferenceParticipantAction: { action: 'uncoach' },
});
await pause(10000);

// back to SILENT MONITOR
console.log('silent monitor: heard by no one');
await client.calls.update(supervisorCallSid, { conf_mute_status: 'mute' });

/* -- tags are dynamic too --------------------------------------------------
// promote/demote any live participant without a re-join; an active coach
// starts/stops reaching them immediately:
// await client.calls.update(someCallSid, {
//   conferenceParticipantAction: { action: 'tag', tag: 'agent' },
// });
// await client.calls.update(someCallSid, {
//   conferenceParticipantAction: { action: 'untag' },
// });
--------------------------------------------------------------------------- */

/* -- stop the transcription tap -------------------------------------------- */
await fetch(
  `${baseUrl}/v1/Accounts/${accountSid}/Conferences/${encodeURIComponent(roomName)}/listen`,
  { method: 'DELETE', headers: { Authorization: `Bearer ${apiKey}` } });
console.log('listen fork stopped');
