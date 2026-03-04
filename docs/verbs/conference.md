## Conference auto-destroy behavior

A conference is created when the first participant with `startConferenceOnEnter: true` joins. It is destroyed when the last participant leaves — you do not need to explicitly clean it up.

If you want a specific participant (e.g. a moderator) to end the conference for everyone when they leave, set `endConferenceOnExit: true` on that participant only.

## PIN-based conferences

A common pattern is to collect a PIN via `gather` and use it as the conference name. This lets multiple independent conferences share one application:

```typescript
session.conference({
  name: `pin-${digits}`,
  beep: true,
  startConferenceOnEnter: true,
  actionHook: '/conference-done',
});
```

## Waiting room (hold music)

If `startConferenceOnEnter` is `false` for a participant, they wait silently until someone with `startConferenceOnEnter: true` joins. Use `waitHook` to play hold music while they wait:

```typescript
session.conference({
  name: 'team-call',
  startConferenceOnEnter: false,
  waitHook: '/hold-music',
});
```

The `waitHook` handler should return `say` or `play` verbs. jambonz will loop them until the conference starts.

## statusHook events

Subscribe to events via `statusEvents` and receive them at `statusHook`. Available events: `join`, `leave`, `start-talking`, `stop-talking`.

The payload includes `event`, `conferenceSid` (the conference name), and `members` (current participant count). Your handler must reply — in WebSocket mode, call `session.reply()` even if you have no verbs to send.

## actionHook fires on exit

The `actionHook` fires when this participant leaves the conference (either by hanging up or being removed). Return verbs to continue the call, or `hangup` to end it:

```typescript
session.on('/conference-done', () => {
  session
    .say({ text: 'You have left the conference. Goodbye.' })
    .hangup()
    .reply();
});
```
