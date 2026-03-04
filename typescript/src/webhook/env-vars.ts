/**
 * Express middleware that auto-responds to HTTP OPTIONS requests with the
 * application environment variables schema for jambonz portal discovery.
 */

import type { EnvVarSchema } from '../types/common.js';

/**
 * Express middleware that auto-responds to HTTP OPTIONS requests with the
 * application's environment variable schema, enabling jambonz portal discovery.
 *
 * @param schema - The environment variable schema to expose.
 *
 * @example
 * ```typescript
 * import { envVarsMiddleware } from '@jambonz/sdk/webhook';
 *
 * const envVars = {
 *   API_KEY: { type: 'string', description: 'Your API key', required: true },
 * };
 * app.use(envVarsMiddleware(envVars));
 * ```
 */
export function envVarsMiddleware(schema: EnvVarSchema) {
  return (req: { method: string }, res: { json: (body: unknown) => void }, next: () => void) => {
    if (req.method === 'OPTIONS') {
      res.json(schema);
      return;
    }
    next();
  };
}
