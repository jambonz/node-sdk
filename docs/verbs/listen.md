## Bidirectional audio modes

The listen verb supports two bidirectional audio modes, controlled by the `bidirectionalAudio` property:

**Non-streaming** (default) — send complete audio clips as base64 via `playAudio()`:
```typescript
session.listen({
  url: '/audio',
  actionHook: '/listen-done',
  // bidirectionalAudio not needed — non-streaming is the default
});
```
Use `stream.playAudio(base64, { audioContentType: 'raw', sampleRate: 8000 })` to play audio back. Up to 10 clips can be queued. Each clip triggers a `playDone` event when finished.

**Streaming** — send raw L16 PCM binary frames via `sendAudio()`:
```typescript
session.listen({
  url: '/audio',
  actionHook: '/listen-done',
  bidirectionalAudio: {
    enabled: true,
    streaming: true,
    sampleRate: 8000,
  },
});
```
Use `stream.sendAudio(pcmBuffer)` to stream audio continuously. This is required for real-time audio processing (e.g. AI voice agents, echo, audio manipulation).

## Marks (synchronization markers)

Marks let you track when streamed audio has been played out to the caller. They work **only in streaming mode** — you must set `bidirectionalAudio: { enabled: true, streaming: true }`.

The pattern: stream audio via `sendAudio()`, then call `sendMark(name)`. When the audio preceding the mark finishes playing, jambonz sends back a mark event with `event: 'playout'`.

```typescript
stream.sendAudio(pcmChunk1);
stream.sendMark('after-chunk-1');  // fires when pcmChunk1 finishes playing

stream.on('mark', (evt) => {
  // evt.name = 'after-chunk-1'
  // evt.event = 'playout' or 'cleared'
});
```

Use `stream.clearMarks()` to cancel all pending marks — they fire with `event: 'cleared'` instead of `'playout'`.

**Common mistake**: marks silently fail without `bidirectionalAudio.streaming: true`. Without it there is no playout buffer, so marks are accepted but never fire.

## Relative URLs

The `url` property accepts relative paths. jambonz connects the audio WebSocket back to the same server:

```typescript
session.listen({ url: '/audio', actionHook: '/listen-done' });
```

This avoids hardcoding hostnames. Use `makeService.audio({ path: '/audio' })` to register the audio handler on the same endpoint.

## Path separation

The control WebSocket and audio WebSocket must use **different paths**. If both are registered on the same path (e.g. `/`), audio routes take priority and steal control connections.

```typescript
// Correct — separate paths
const svc = makeService({ path: '/' });
const audioSvc = makeService.audio({ path: '/audio' });

// Wrong — same path causes conflicts
const svc = makeService({ path: '/' });
const audioSvc = makeService.audio({ path: '/' });  // steals control connections
```
