/**
 * Environment variable schema for the realtime translator.
 *
 * The schema is passed to createEndpoint() so jambonz can discover
 * the app's configuration via OPTIONS. At call time the values arrive
 * in session.data.env_vars.
 */
import type { EnvVarSchema } from '@jambonz/sdk/types';

/** Schema declared to jambonz — the portal renders a form from this. */
export const envVars: EnvVarSchema = {
  CALLER_LANGUAGE_CODE: { type: 'string', description: 'Caller language (BCP-47)', required: true },
  CALLER_TTS_VENDOR:    { type: 'string', description: 'Caller TTS vendor', required: true },
  CALLER_TTS_VOICE:     { type: 'string', description: 'Caller TTS voice', required: true },
  CALLER_STT_VENDOR:    { type: 'string', description: 'Caller STT vendor', required: true },
  CALLED_LANGUAGE_CODE: { type: 'string', description: 'Called party language (BCP-47)', required: true },
  CALLED_TTS_VENDOR:    { type: 'string', description: 'Called party TTS vendor', required: true },
  CALLED_TTS_VOICE:     { type: 'string', description: 'Called party TTS voice', required: true },
  CALLED_STT_VENDOR:    { type: 'string', description: 'Called party STT vendor', required: true },
  DIAL_TARGET:          { type: 'string', description: 'Phone number to dial in E.164 format (e.g. +15551234567)', required: true },
};
