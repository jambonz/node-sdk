/**
 * A minimal jambonz custom harness.
 *
 * Out of the box createHarness() is a pass-through: it sends the conversation to an OpenAI-compatible
 * model and streams the reply back to jambonz. This example adds three small hooks:
 *   - beforeModel routes each turn by keyword to a procedure with its own prompt and tools
 *   - a tool of its own (lookup_outage), run in-process
 *   - checkSentence, which never lets a long digit string be read out
 */
import { createHarness } from '@jambonz/sdk/harness';
import { pino } from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const port = Number(process.env.PORT ?? 8080);

// pretend outage data; a real harness would call its own systems here
const OUTAGES: Record<string, { area: string; until: string }> = {
  'main street': { area: 'Main Street', until: '5 pm today' },
};

const PROCEDURES = {
  outage: {
    keywords: ['outage', 'power', 'electricity', 'lights'],
    prompt:
      'You help callers report and check power outages for Acme Energy. Ask for the street if you do not have it, ' +
      'then use lookup_outage. Keep answers to one or two short sentences; they are spoken aloud.',
    tools: ['lookup_outage'],
  },
  billing: {
    keywords: ['bill', 'billing', 'payment', 'charge', 'invoice'],
    prompt:
      'You answer billing questions for Acme Energy. You cannot see account details; offer to transfer the caller ' +
      'to billing if they need their account. Keep answers short; they are spoken aloud.',
    tools: [] as string[],
  },
};

function route(text: string): keyof typeof PROCEDURES | undefined {
  const lower = text.toLowerCase();
  return (Object.keys(PROCEDURES) as Array<keyof typeof PROCEDURES>).find((p) =>
    PROCEDURES[p].keywords.some((k) => lower.includes(k)),
  );
}

createHarness({
  logger,
  apiKey: process.env.HARNESS_API_KEY, // the key in the jambonz Harness credential
  model: process.env.MODEL ?? 'gpt-4.1-mini',
  instructions:
    'You answer phone calls for Acme Energy. Be warm and brief: one or two sentences, plain text, no lists or markdown.',
  greeting: 'Thanks for calling Acme Energy. How can I help you today?',

  onSessionStart(session, ctx) {
    ctx.log.info({ from: session.from, metadata: session.metadata }, 'new call');
  },

  // routing: once a procedure is chosen it stays in force for later turns
  beforeModel(turn, ctx) {
    const picked = route(turn.text) ?? (ctx.state.get('procedure') as keyof typeof PROCEDURES | undefined);
    if (!picked) return { route: 'chat' };
    ctx.state.set('procedure', picked);
    const p = PROCEDURES[picked];
    ctx.record('procedures', [picked]);
    return { route: 'procedure', instructions: p.prompt, tools: p.tools };
  },

  tools: {
    lookup_outage: {
      description: 'Find a reported power outage on a street',
      parameters: {
        type: 'object',
        properties: { street: { type: 'string', description: 'Street name, e.g. "Main Street"' } },
        required: ['street'],
      },
      run: ({ street }) => {
        const hit = OUTAGES[String(street).toLowerCase()];
        return hit ? { outage: true, ...hit } : { outage: false };
      },
    },
  },

  // never read out anything that looks like an account or card number
  checkSentence: (sentence) => (/\d{6,}/.test(sentence) ? "I can't read that number out over the phone." : true),

  onEvent: {
    // the caller pressed 0: hand them to a person, if an operator number is configured
    async dtmf(e, ctx) {
      if (e.digits !== '0' || !process.env.OPERATOR_NUMBER) return;
      ctx.say('Connecting you to a person now.');
      const result = await ctx.command('transfer', { to: process.env.OPERATOR_NUMBER });
      if (!result.ok) ctx.log.warn({ error: result.error }, 'transfer to operator failed');
    },
  },
})
  .listen(port)
  .catch((err) => {
    logger.error({ err }, 'could not start the harness');
    process.exit(1);
  });
