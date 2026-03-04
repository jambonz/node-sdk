/**
 * Translator route — bridges an inbound call to a remote party and
 * translates speech in both directions using STT → Google Translate → TTS.
 *
 * Audio never leaves jambonz — only transcription text arrives here.
 * Translated text is injected back via dub tracks using injectCommand.
 */
import type { Session } from '@jambonz/sdk/websocket';
import { translateText } from '../utils/translate.js';

export default function translator(session: Session) {
  const log = (msg: string) => console.log(`[${session.callSid}] ${msg}`);
  log('new call — setting up translation bridge');

  const env = (session.data.env_vars ?? {}) as Record<string, string>;

  const recognizer_a  = { vendor: env.CALLER_STT_VENDOR, language: env.CALLER_LANGUAGE_CODE };
  const recognizer_b  = { vendor: env.CALLED_STT_VENDOR, language: env.CALLED_LANGUAGE_CODE };
  const synthesizer_a = { vendor: env.CALLER_TTS_VENDOR, language: env.CALLER_LANGUAGE_CODE, voice: env.CALLER_TTS_VOICE };
  const synthesizer_b = { vendor: env.CALLED_TTS_VENDOR, language: env.CALLED_LANGUAGE_CODE, voice: env.CALLED_TTS_VOICE };

  // ---- Event handlers ----

  session.on('call:status', (evt: Record<string, any>) => {
    // Capture the B-leg call_sid when the outbound leg connects
    if (!session.locals.call_sid_b && evt.direction === 'outbound') {
      session.locals.call_sid_b = evt.call_sid;
      log(`B-leg call_sid: ${evt.call_sid}`);
    }
  });

  // A-leg transcription → translate → speak on B-leg
  session.on('/transcription-a', (evt: Record<string, any>) => {
    const transcript = evt.speech?.alternatives?.[0]?.transcript;
    session.reply();

    const callSidB = session.locals.call_sid_b as string | undefined;
    if (!transcript || !callSidB) return;

    log(`A says: "${transcript}"`);
    translateText(transcript, recognizer_a.language, recognizer_b.language)
      .then((translation) => {
        if (!translation) return;
        log(`→ B hears: "${translation}"`);
        session.injectCommand('dub', {
          action: 'sayOnTrack',
          track: 'b',
          say: { text: translation, synthesizer: synthesizer_b },
        }, callSidB);
      })
      .catch((err) => console.error('Translation error (A→B):', err));
  });

  // B-leg transcription → translate → speak on A-leg
  session.on('/transcription-b', (evt: Record<string, any>) => {
    const transcript = evt.speech?.alternatives?.[0]?.transcript;
    session.reply();

    if (!transcript) return;

    log(`B says: "${transcript}"`);
    translateText(transcript, recognizer_b.language, recognizer_a.language)
      .then((translation) => {
        if (!translation) return;
        log(`→ A hears: "${translation}"`);
        session.injectCommand('dub', {
          action: 'sayOnTrack',
          track: 'a',
          say: { text: translation, synthesizer: synthesizer_a },
        });
      })
      .catch((err) => console.error('Translation error (B→A):', err));
  });

  session.on('close', (code: number) => log(`closed (${code})`));
  session.on('error', (err: Error) => console.error(`[${session.callSid}] error:`, err));

  // ---- Verb sequence ----

  session
    .answer()

    // A-leg: attenuate remote audio, enable transcription, add dub track
    .config({
      boostAudioSignal: '-20 dB',
      recognizer: recognizer_a,
      transcribe: {
        enable: true,
        transcriptionHook: '/transcription-a',
      },
    })
    .dub({ action: 'addTrack', track: 'a' })

    // Dial B-leg with matching config
    .dial({
      target: [{ type: 'phone', number: env.DIAL_TARGET }],
      boostAudioSignal: '-20 dB',
      transcribe: {
        transcriptionHook: '/transcription-b',
        channel: 2,
        recognizer: recognizer_b,
      },
      dub: [{ action: 'addTrack', track: 'b' }],
    })

    .hangup()
    .send();
}
