/**
 * Environment variable schema and utilities for the Retell-hosted app.
 *
 * The schema is passed to createEndpoint() so jambonz can discover
 * the app's configuration via OPTIONS. At call time the values arrive
 * in session.data.env_vars.
 */
import type { EnvVarSchema } from '@jambonz/sdk/types';
import { PhoneNumberFormat, PhoneNumberUtil } from 'google-libphonenumber';

const phoneUtil = PhoneNumberUtil.getInstance();

/** Schema declared to jambonz — the portal renders a form from this. */
export const envVars: EnvVarSchema = {
  RETELL_TRUNK_NAME: {
    type: 'string',
    description: 'The name of the Carrier you configured in jambonz towards Retell',
    required: true,
  },
  PSTN_TRUNK_NAME: {
    type: 'string',
    description: 'The name of the Carrier you configured in jambonz towards your SIP service provider',
    required: true,
  },
  DEFAULT_COUNTRY: {
    type: 'string',
    description: 'ISO 3166-1 alpha-2 country code for phone number formatting (e.g. US, GB)',
    required: false,
  },
  OVERRIDE_FROM_USER: {
    type: 'string',
    description: 'Value to use for From header in outbound calls to PSTN (original caller ID moved to Diversion header)',
    required: false,
  },
  PASS_REFER: {
    type: 'boolean',
    description: 'When Retell sends a cold transfer (SIP REFER), pass the REFER to the originating carrier if true; otherwise dial a new call via jambonz',
    default: true,
  },
};

/** Format a phone number to E.164 using the given country code. */
export function getE164(number: string, country: string): string {
  try {
    const parsed = phoneUtil.parseAndKeepRawInput(number, country);
    if (phoneUtil.isValidNumber(parsed)) {
      return phoneUtil.format(parsed, PhoneNumberFormat.E164);
    }
  } catch {
    // fall through
  }
  return number;
}
