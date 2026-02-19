import { describe, it, expect } from 'vitest';
import { WebhookResponse } from '../src/webhook/response.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_test = dirname(fileURLToPath(import.meta.url));
const schemaDir = resolve(__dirname_test, '../../schema');

describe('WebhookResponse', () => {
  it('should build a simple greeting', () => {
    const response = new WebhookResponse({ validate: false });
    response
      .say({ text: 'Hello!' })
      .hangup();

    const json = response.toJSON();
    expect(json).toHaveLength(2);
    expect(json[0]).toEqual({ verb: 'say', text: 'Hello!' });
    expect(json[1]).toEqual({ verb: 'hangup' });
  });

  it('should build an IVR menu', () => {
    const response = new WebhookResponse({ validate: false });
    response
      .gather({
        input: ['digits'],
        numDigits: 1,
        actionHook: '/menu',
        say: { text: 'Press 1 for sales, 2 for support.' },
      });

    const json = response.toJSON();
    expect(json).toHaveLength(1);
    expect(json[0].verb).toBe('gather');
  });

  it('should build a config + llm flow', () => {
    const response = new WebhookResponse({ validate: false });
    response
      .config({
        synthesizer: { vendor: 'elevenlabs', voice: 'Rachel' },
        recognizer: { vendor: 'deepgram', language: 'en-US' },
      })
      .llm({
        vendor: 'openai',
        model: 'gpt-4o',
        llmOptions: {
          messages: [{ role: 'system', content: 'Be helpful.' }],
        },
        actionHook: '/done',
        toolHook: '/tool',
      });

    const json = response.toJSON();
    expect(json).toHaveLength(2);
    expect(json[0].verb).toBe('config');
    expect(json[1].verb).toBe('llm');
  });

  it('should accept raw JSON via addVerbs', () => {
    const response = new WebhookResponse({ validate: false });
    response.addVerbs([
      { verb: 'say', text: 'Hello' },
      { verb: 'pause', length: 1 },
      { verb: 'hangup' },
    ]);

    expect(response.toJSON()).toHaveLength(3);
  });

  it('should chain fluent and raw methods', () => {
    const response = new WebhookResponse({ validate: false });
    response
      .config({ synthesizer: { vendor: 'google' } })
      .addVerbs([{ verb: 'say', text: 'Mixed.' }])
      .hangup();

    expect(response.toJSON()).toHaveLength(3);
  });

  it('should handle SIP verbs with camelCase methods', () => {
    const response = new WebhookResponse({ validate: false });
    response.sipDecline({ status: 486, reason: 'Busy' });

    const json = response.toJSON();
    expect(json[0].verb).toBe('sip:decline');
  });

  it('should validate verbs when validation is enabled', () => {
    const response = new WebhookResponse({ schemaDir });
    // pause requires 'length'
    expect(() => {
      response.pause({} as any);
    }).toThrow();
  });

  it('should clear verbs', () => {
    const response = new WebhookResponse({ validate: false });
    response.say({ text: 'Hello' });
    expect(response.length).toBe(1);
    response.clear();
    expect(response.length).toBe(0);
  });
});
