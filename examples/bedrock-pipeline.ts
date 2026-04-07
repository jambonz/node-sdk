import * as http from 'node:http';
import pino from 'pino';
import { createEndpoint, Session } from '@jambonz/sdk/websocket';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const envVars = {
  LLM_VENDOR: {
    type: 'string' as const,
    description: 'LLM vendor (openai, bedrock, anthropic, google)',
    default: 'openai',
  },
  LLM_MODEL: {
    type: 'string' as const,
    description: 'LLM model to use',
    default: 'gpt-4.1-mini',
  },
  CARTESIA_VOICE: {
    type: 'string' as const,
    description: 'Cartesia voice ID',
    default: '9626c31c-bec5-4cca-baa8-f8ba9e84c8bc',
  },
  ELEVENLABS_VOICE: {
    type: 'string' as const,
    description: 'ElevenLabs voice id',
    default: 'hpp4J3VqNfWAUOO0d1Us',
  },
  SYSTEM_PROMPT: {
    type: 'string' as const,
    description: 'System prompt for the voice agent',
    uiHint: 'textarea' as const,
    default: [
      'You are a helpful voice AI assistant.',
      'The user is interacting with you via voice,',
      'even if you perceive the conversation as text.',
      'You eagerly assist users with their questions',
      'by providing information from your extensive knowledge.',
      'Your responses are concise, to the point,',
      'and use natural spoken English with proper punctuation.',
      'Never use markdown, bullet points, numbered lists,',
      'emojis, asterisks, or any special formatting.',
      'You are curious, friendly, and have a sense of humor.',
      'When the conversation begins,',
      'greet the user in a helpful and friendly manner.',
    ].join(' '),
  },
};

interface SttConfig {
  vendor: string;
  language?: string;
  deepgramOptions?: Record<string, unknown>;
  assemblyAiOptions?: Record<string, unknown>;
  speechmaticsOptions?: Record<string, unknown>;
}

interface TtsConfig {
  vendor: string;
  voiceEnvVar: string;
  options?: Record<string, unknown>;
}

interface PipelineOptions {
  stt: SttConfig;
  tts: TtsConfig;
  turnDetection: 'krisp' | 'stt';
  noiseIsolation?: 'krisp' | 'rnnoise';
}

function handleSession(session: Session, opts: PipelineOptions) {
  const log = logger.child({ call_sid: session.callSid });
  const llmVendor = session.data.env_vars?.LLM_VENDOR || 'openai';
  const model = session.data.env_vars?.LLM_MODEL || 'gpt-4.1-mini';
  const voice = session.data.env_vars?.[opts.tts.voiceEnvVar]
    || envVars[opts.tts.voiceEnvVar as keyof typeof envVars]?.default;
  const systemPrompt = session.data.env_vars?.SYSTEM_PROMPT || envVars.SYSTEM_PROMPT.default;

  /* Demo: update_tools mid-conversation to add web search capability.
     After the user's second question (turn_end #2), inject a web_search tool.
     The agent starts without web search, so early questions get stale answers.
     Once the tool is added, the agent can search the web via Tavily. */
  let turnCount = 0;
  let toolsInjected = false;

  session.on('/pipeline-event', (evt: Record<string, unknown>) => {
    log.info({payload: evt}, `pipeline event: ${evt.type}`);

    if (evt.type === 'turn_end') {
      turnCount++;
      if (turnCount === 2 && !toolsInjected) {
        toolsInjected = true;
        log.info('injecting web_search tool');
        session.updatePipeline({
          type: 'update_tools',
          tools: [
            {
              type: 'function',
              function: {
                name: 'web_search',
                description: 'Search the web for current information. Use this when the user asks about recent events, product releases, or anything that may be newer than your training data.',
                parameters: {
                  type: 'object',
                  properties: {
                    query: {
                      type: 'string',
                      description: 'The search query',
                    },
                  },
                  required: ['query'],
                },
              },
            },
          ],
        });
        session.updatePipeline({
          type: 'inject_context',
          messages: [
            {
              role: 'system',
              content: 'You now have access to a web_search tool. When the user asks about current products, recent releases, or anything that might be newer than your training data, use the web_search tool to get up-to-date information.',
            },
          ],
        });
      }
    }
  });

  session.on('/tool-call', async (evt: Record<string, unknown>) => {
    log.info({payload: evt}, 'tool call received');
    if (evt.name === 'web_search') {
      const args = evt.arguments as Record<string, string>;
      const query = args?.query || '';
      log.info({query}, 'searching Tavily');
      try {
        const res = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            api_key: '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',
            query,
            max_results: 3,
            search_depth: 'basic',
          }),
        });
        const data = await res.json() as {results?: Array<{title: string; content: string; url: string}>};
        const results = (data.results || []).map(
          (r: {title: string; content: string; url: string}) => `${r.title}: ${r.content}`
        ).join('\n\n');
        log.info({results}, 'Tavily results');
        session.sendToolOutput(evt.tool_call_id as string, results || 'No results found.');
      } catch (err) {
        log.error({err}, 'Tavily search failed');
        session.sendToolOutput(evt.tool_call_id as string, 'Web search failed. Please try again.');
      }
    }
  });

  session.on('/pipeline-complete', (evt: Record<string, unknown>) => {
    log.info({payload: evt}, 'pipeline completed');
    session.hangup().reply();
  });

  session
    .pipeline({
      stt: opts.stt,
      tts: {
        vendor: opts.tts.vendor,
        voice,
        ...opts.tts.options && { options: opts.tts.options },
      },
      llm: {
        vendor: llmVendor,
        model,
        llmOptions: {
          messages: [
            { role: 'system', content: systemPrompt },
          ],
        },
      },
      turnDetection: opts.turnDetection,
      ...opts.noiseIsolation && { noiseIsolation: opts.noiseIsolation },
      earlyGeneration: true,
      bargeIn: {
        enable: true,
      },
      eventHook: '/pipeline-event',
      toolHook: '/tool-call',
      actionHook: '/pipeline-complete',
    })
    .send();
}

const port = parseInt(process.env.PORT || '3000', 10);
const server = http.createServer();
const makeService = createEndpoint({ server, port, envVars });

/* Deepgram nova-3 + Krisp turn detection */
const svc = makeService({ path: '/' });
svc.on('session:new', (session) => {
  handleSession(session, {
    stt: {
      vendor: 'deepgram',
      language: 'multi',
      deepgramOptions: { model: 'nova-3-general' },
    },
    tts: { vendor: 'cartesia', voiceEnvVar: 'CARTESIA_VOICE' },
    turnDetection: 'krisp',
  });
});

/* Deepgram Flux + native turn detection */
const fluxSvc = makeService({ path: '/flux' });
fluxSvc.on('session:new', (session) => {
  handleSession(session, {
    stt: { vendor: 'deepgramflux' },
    tts: { vendor: 'cartesia', voiceEnvVar: 'CARTESIA_VOICE' },
    turnDetection: 'stt',
  });
});

/* AssemblyAI u3-rt-pro + native turn detection */
const aaiSvc = makeService({ path: '/aai' });
aaiSvc.on('session:new', (session) => {
  handleSession(session, {
    stt: {
      vendor: 'assemblyai',
      assemblyAiOptions: {
        languageDetection: true,
      },
    },
    tts: { vendor: 'cartesia', voiceEnvVar: 'CARTESIA_VOICE' },
    turnDetection: 'stt',
  });
});

/* Deepgram nova-3 + Krisp turn detection + ElevenLabs TTS */
const elSvc = makeService({ path: '/elevenlabs' });
elSvc.on('session:new', (session) => {
  handleSession(session, {
    stt: {
      vendor: 'deepgram',
      language: 'multi',
      deepgramOptions: { model: 'nova-3-general' },
    },
    tts: {
      vendor: 'elevenlabs',
      voiceEnvVar: 'ELEVENLABS_VOICE',
      options: { model_id: 'eleven_flash_v2_5' },
    },
    turnDetection: 'krisp',
  });
});

/* Speechmatics preview + native turn detection */
const smSvc = makeService({ path: '/speechmatics' });
smSvc.on('session:new', (session) => {
  handleSession(session, {
    stt: {
      vendor: 'speechmaticspreview',
      language: 'en',
    },
    tts: { vendor: 'cartesia', voiceEnvVar: 'CARTESIA_VOICE' },
    turnDetection: 'stt',
  });
});

logger.info({ port }, 'jambonz voice agent listening');
