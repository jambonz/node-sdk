/**
 * Real-time translator — bridges two parties and translates speech
 * in both directions using jambonz STT, Google Translate, and jambonz TTS.
 *
 * Configuration is provided via jambonz application environment variables
 * (configured in the jambonz portal). GOOGLE_APPLICATION_CREDENTIALS must
 * be set in the process environment for the Google Translate API.
 */
import http from 'http';
import { createEndpoint } from '@jambonz/sdk/websocket';
import { envVars } from './utils/config.js';
import translator from './routes/translator.js';

const port = Number(process.env.PORT) || 3000;
const server = http.createServer();
const makeService = createEndpoint({ server, port, envVars });

const svc = makeService({ path: '/translator' });
svc.on('session:new', (session) => translator(session));

console.log(`Realtime translator listening on port ${port}`);
