/**
 * WebhookResponse — verb builder for HTTP webhook applications.
 * Extends VerbBuilder with toJSON() and signature verification.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { VerbBuilder, type VerbBuilderOptions } from '../verb-builder.js';
import type { JambonzApp } from '../types/verbs.js';
import type { IncomingMessage, ServerResponse } from 'http';

export class WebhookResponse extends VerbBuilder {
  constructor(opts?: VerbBuilderOptions) {
    super(opts);
  }

  /** Returns the verb array for JSON serialization. */
  toJSON(): JambonzApp {
    return [...this.verbs];
  }

  /**
   * Express-compatible middleware for verifying jambonz webhook signatures.
   * Uses HMAC-SHA256 with timing-safe comparison.
   */
  static verifySignature(secret: string, opts?: { tolerance?: number }) {
    const tolerance = opts?.tolerance ?? 300; // 5 minutes default

    return (
      req: IncomingMessage & { body?: unknown; rawBody?: Buffer },
      _res: ServerResponse,
      next: (err?: Error) => void
    ) => {
      try {
        const signature = (req.headers as Record<string, string | undefined>)['jambonz-signature'];
        if (!signature) {
          throw new Error('Missing Jambonz-Signature header');
        }

        const parts = signature.split(',');
        let timestamp = '';
        const signatures: string[] = [];

        for (const part of parts) {
          const [key, value] = part.split('=');
          if (key === 't') timestamp = value;
          else if (key === 'v1') signatures.push(value);
        }

        if (!timestamp || signatures.length === 0) {
          throw new Error('Invalid Jambonz-Signature format');
        }

        // Check timestamp tolerance
        const ts = parseInt(timestamp, 10);
        const now = Math.floor(Date.now() / 1000);
        if (Math.abs(now - ts) > tolerance) {
          throw new Error('Webhook signature timestamp outside tolerance');
        }

        // Compute expected signature
        const payload = typeof req.body === 'string'
          ? req.body
          : JSON.stringify(req.body);
        const signedPayload = `${timestamp}.${payload}`;
        const expected = createHmac('sha256', secret)
          .update(signedPayload)
          .digest('hex');

        // Timing-safe comparison
        const matched = signatures.some((sig) => {
          try {
            return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
          } catch {
            return false;
          }
        });

        if (!matched) {
          throw new Error('Webhook signature verification failed');
        }

        next();
      } catch (err) {
        next(err instanceof Error ? err : new Error(String(err)));
      }
    };
  }
}
