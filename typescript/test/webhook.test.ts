import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'crypto';
import { WebhookResponse } from '../src/webhook/response.js';
import { envVarsMiddleware } from '../src/webhook/env-vars.js';
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

  it('should build all call-control verbs', () => {
    const response = new WebhookResponse({ validate: false });
    response
      .answer()
      .play({ url: 'https://example.com/audio.wav' })
      .pause({ length: 2 })
      .dial({ target: [{ type: 'phone', number: '+15551234567' }] })
      .dtmf({ dtmf: '1234' })
      .transcribe({ transcriptionHook: '/transcription', recognizer: { vendor: 'deepgram', language: 'en-US' } })
      .listen({ url: 'wss://example.com/audio' })
      .stream({ url: 'wss://example.com/stream' })
      .dub({ action: 'addTrack', track: 'background', play: { url: 'https://example.com/music.mp3' } })
      .enqueue({ name: 'support', waitHook: '/wait' })
      .leave()
      .tag({ data: { priority: 'high' } })
      .redirect({ actionHook: '/next' })
      .hangup();

    const json = response.toJSON();
    expect(json).toHaveLength(14);
    expect(json.map((v) => v.verb)).toEqual([
      'answer', 'play', 'pause', 'dial', 'dtmf', 'transcribe',
      'listen', 'stream', 'dub', 'enqueue', 'leave', 'tag', 'redirect', 'hangup',
    ]);
  });

  it('should build SIP verbs', () => {
    const response = new WebhookResponse({ validate: false });
    response
      .sipDecline({ status: 486, reason: 'Busy' })
      .sipRequest({ method: 'INFO', content_type: 'application/dtmf', content: '1' })
      .sipRefer({ referTo: 'sip:user@example.com', actionHook: '/refer-status' });

    const json = response.toJSON();
    expect(json).toHaveLength(3);
    expect(json[0].verb).toBe('sip:decline');
    expect(json[1].verb).toBe('sip:request');
    expect(json[2].verb).toBe('sip:refer');
  });

  it('should validate addVerbs and throw on invalid input', () => {
    const response = new WebhookResponse({ schemaDir });
    expect(() => {
      response.addVerbs([{ verb: 'pause' } as any]); // missing required 'length'
    }).toThrow('Verb validation failed');
  });

  it('should accept valid addVerbs input', () => {
    const response = new WebhookResponse({ schemaDir });
    response.addVerbs([
      { verb: 'say', text: 'Hello' },
      { verb: 'pause', length: 1 },
    ]);
    expect(response.toJSON()).toHaveLength(2);
  });

  it('toJSON returns a copy, not a reference', () => {
    const response = new WebhookResponse({ validate: false });
    response.say({ text: 'Hello' });
    const json1 = response.toJSON();
    const json2 = response.toJSON();
    expect(json1).toEqual(json2);
    expect(json1).not.toBe(json2); // different array instances
  });
});

// --- verifySignature middleware ---

function makeSignature(secret: string, body: unknown, timestamp?: number) {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const payload = JSON.stringify(body);
  const sig = createHmac('sha256', secret).update(`${ts}.${payload}`).digest('hex');
  return { header: `t=${ts},v1=${sig}`, timestamp: ts };
}

describe('WebhookResponse.verifySignature', () => {
  const secret = 'test-webhook-secret';

  it('calls next() on valid signature', () => {
    const body = { call_sid: 'abc', call_status: 'completed' };
    const { header } = makeSignature(secret, body);
    const req = { headers: { 'jambonz-signature': header }, body } as any;
    const res = {} as any;
    const next = vi.fn();

    WebhookResponse.verifySignature(secret)(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('errors when signature header is missing', () => {
    const req = { headers: {}, body: {} } as any;
    const res = {} as any;
    const next = vi.fn();

    WebhookResponse.verifySignature(secret)(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Missing Jambonz-Signature header' }));
  });

  it('errors on invalid signature format (no v1)', () => {
    const req = { headers: { 'jambonz-signature': 't=12345' }, body: {} } as any;
    const res = {} as any;
    const next = vi.fn();

    WebhookResponse.verifySignature(secret)(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Invalid Jambonz-Signature format' }));
  });

  it('errors when timestamp is outside tolerance', () => {
    const body = { test: true };
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 min ago
    const { header } = makeSignature(secret, body, oldTimestamp);
    const req = { headers: { 'jambonz-signature': header }, body } as any;
    const res = {} as any;
    const next = vi.fn();

    WebhookResponse.verifySignature(secret)(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Webhook signature timestamp outside tolerance' }));
  });

  it('respects custom tolerance', () => {
    const body = { test: true };
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600;
    const { header } = makeSignature(secret, body, oldTimestamp);
    const req = { headers: { 'jambonz-signature': header }, body } as any;
    const res = {} as any;
    const next = vi.fn();

    // 700s tolerance should allow 600s-old timestamp
    WebhookResponse.verifySignature(secret, { tolerance: 700 })(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('errors when signature does not match', () => {
    const body = { data: 'original' };
    const { header } = makeSignature(secret, body);
    // Tamper with body
    const req = { headers: { 'jambonz-signature': header }, body: { data: 'tampered' } } as any;
    const res = {} as any;
    const next = vi.fn();

    WebhookResponse.verifySignature(secret)(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Webhook signature verification failed' }));
  });

  it('verifies when body is a string', () => {
    const bodyStr = '{"call_sid":"abc"}';
    const ts = Math.floor(Date.now() / 1000);
    const sig = createHmac('sha256', secret).update(`${ts}.${bodyStr}`).digest('hex');
    const header = `t=${ts},v1=${sig}`;
    const req = { headers: { 'jambonz-signature': header }, body: bodyStr } as any;
    const res = {} as any;
    const next = vi.fn();

    WebhookResponse.verifySignature(secret)(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });
});

// --- envVarsMiddleware ---

describe('envVarsMiddleware', () => {
  const schema = {
    API_KEY: { type: 'string' as const, description: 'Your API key', required: true },
    DEBUG: { type: 'boolean' as const, description: 'Enable debug mode' },
  };

  it('responds with schema on OPTIONS request', () => {
    const middleware = envVarsMiddleware(schema);
    const req = { method: 'OPTIONS' };
    const jsonFn = vi.fn();
    const res = { json: jsonFn };
    const next = vi.fn();

    middleware(req, res, next);
    expect(jsonFn).toHaveBeenCalledWith(schema);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() for non-OPTIONS requests', () => {
    const middleware = envVarsMiddleware(schema);
    const req = { method: 'POST' };
    const res = { json: vi.fn() };
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('calls next() for GET requests', () => {
    const middleware = envVarsMiddleware(schema);
    const req = { method: 'GET' };
    const res = { json: vi.fn() };
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
