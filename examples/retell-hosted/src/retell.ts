/**
 * Retell route handler — bridges calls between PSTN and Retell AI.
 *
 * Two call directions:
 *   1. PSTN → Retell: inbound call from a phone number is forwarded to
 *      the Retell trunk so the AI agent handles it.
 *   2. Retell → PSTN: Retell initiates an outbound call, jambonz dials
 *      the destination number via the PSTN trunk.
 *
 * SIP REFER (cold transfer) from Retell is supported in two modes:
 *   - PASS_REFER=true:  REFER is forwarded to the originating carrier
 *   - PASS_REFER=false: jambonz places a new outbound dial to the transfer target
 */
import type { Session } from '@jambonz/sdk/websocket';
import { getE164 } from './config.js';

/** Track sessions by call_sid for adulting (refer-complete) scenario. */
const sessions = new Map<string, Session>();

export default function retell(session: Session) {
  const log = (msg: string) => console.log(`[${session.callSid}] ${msg}`);
  const { data } = session;
  const env = (data.env_vars ?? {}) as Record<string, string>;
  const sipHeaders = data.sip?.headers ?? {};

  sessions.set(session.callSid, session);

  let { from, to } = data;

  // Determine if call is coming from Retell (trunk match)
  const outboundFromRetell =
    data.direction === 'inbound' &&
    env.RETELL_TRUNK_NAME &&
    data.originating_sip_trunk_name === env.RETELL_TRUNK_NAME;

  if (outboundFromRetell) {
    log(`call from Retell trunk "${data.originating_sip_trunk_name}"`);
  } else {
    log(`call from PSTN trunk "${data.originating_sip_trunk_name}"`);
  }

  // ---- Event handlers ----

  session.on('/refer', (evt: Record<string, any>) => {
    const { refer_details } = evt;
    log(`received REFER → ${refer_details?.refer_to_user}`);

    const passRefer = env.PASS_REFER !== undefined ? env.PASS_REFER !== 'false' : true;

    if (passRefer) {
      session
        .sipRefer({
          referTo: refer_details.refer_to_user,
          referredBy: evt.to,
          actionHook: '/referComplete',
        })
        .reply();
      log('REFER passed to originator');
    } else {
      const target = [{
        type: 'phone' as const,
        number: refer_details.x_override_number || refer_details.refer_to_user,
        trunk: refer_details.x_override_carrier || env.PSTN_TRUNK_NAME,
      }];
      session
        .say({ text: 'Connecting you' })
        .dial({
          callerId: evt.to,
          anchorMedia: true,
          actionHook: '/dialAction',
          target,
        })
        .hangup()
        .reply();
      log('new outbound dial for transfer');
    }
  });

  session.on('/dialAction', (evt: Record<string, any>) => {
    if (evt.dial_call_status !== 'completed') {
      log(`dial failed: ${evt.dial_call_status} (SIP ${evt.dial_sip_status})`);
      session
        .sipDecline({ status: evt.dial_sip_status })
        .reply();
    } else {
      log('dial completed');
      session.reply();
    }
  });

  session.on('/referComplete', () => {
    log('refer complete');
    session.reply();
    const parentCallSid = data.parent_call_sid;
    if (parentCallSid) {
      const parentSession = sessions.get(parentCallSid);
      if (parentSession) {
        log(`hanging up parent session ${parentCallSid}`);
        parentSession.hangup().send();
      }
    }
  });

  session.on('close', (code: number) => {
    sessions.delete(session.callSid);
    log(`closed (${code})`);
  });

  session.on('error', (err: Error) => console.error(`[${session.callSid}] error:`, err));

  // ---- Build dial target ----

  try {
    let target: Array<{ type: 'phone'; number: string; trunk: string }>;
    let headers: Record<string, string> = {};

    if (outboundFromRetell) {
      // Forward X-* headers from Retell to the PSTN leg
      headers = Object.fromEntries(
        Object.entries(sipHeaders).filter(([key]) => key.startsWith('X-'))
      ) as Record<string, string>;

      target = [{
        type: 'phone',
        number: sipHeaders['X-Override-Number'] || to,
        trunk: sipHeaders['X-Override-Carrier'] || env.PSTN_TRUNK_NAME,
      }];

      // Caller ID overrides
      if (sipHeaders['X-Original-CLID']) {
        from = sipHeaders['X-Original-CLID'];
      } else if (env.OVERRIDE_FROM_USER) {
        from = env.OVERRIDE_FROM_USER;
      }
    } else {
      // PSTN inbound (or API-originated outbound) → dial Retell
      const pstnInbound = data.direction === 'inbound';
      const dest = env.DEFAULT_COUNTRY ? getE164(to, env.DEFAULT_COUNTRY) : to;

      target = [{
        type: 'phone',
        number: pstnInbound ? dest : from,
        trunk: env.RETELL_TRUNK_NAME,
      }];
      from = pstnInbound ? from : dest;
    }

    session
      .dial({
        callerId: from,
        answerOnBridge: true,
        anchorMedia: true,
        referHook: '/refer',
        actionHook: '/dialAction',
        target,
        headers,
      })
      .hangup()
      .send();

    log(`dialling ${target[0].number} via ${target[0].trunk}`);
  } catch (err) {
    console.error(`[${session.callSid}] error setting up call:`, err);
    session.close();
  }
}
