/**
 * Retell-hosted — bridges calls between PSTN callers and Retell AI agents.
 *
 * Inbound PSTN calls are forwarded to Retell; calls originated by Retell
 * are forwarded to the PSTN.  SIP REFER (cold transfer) is supported.
 *
 * Configuration is provided via jambonz application environment variables
 * (configured in the jambonz portal).
 */
import http from 'http';
import { createEndpoint } from '@jambonz/sdk/websocket';
import { envVars } from './config.js';
import retell from './retell.js';

const port = Number(process.env.PORT) || 3000;
const server = http.createServer();
const makeService = createEndpoint({ server, port, envVars });

const svc = makeService({ path: '/' });
svc.on('session:new', (session) => retell(session));

console.log(`Retell-hosted listening on port ${port}`);
