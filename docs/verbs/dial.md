## Generating ringback tones with tone_stream

The `dialMusic` property is an optional property that can be used to generate audio towards the A party while we are outdialing the B party and get a 180 Ringing from B.  In that case, we may want to play ringback tone or a message to the A party until we gert an answer or a 183 with early media.

Besides an http(s) URL, the value can also be a FreeSWITCH `tone_stream://` URIs in addition to audio file URLs. Use the `L=` parameter to repeat the tone pattern (`L=-1` is not supported; use a finite count like `L=20`):

- **US ringback**: `tone_stream://L=20;%(2000,4000,440,480)`
- **UK ringback**: `tone_stream://L=20;%(400,200,400,450);%(400,2000,400,450)`
