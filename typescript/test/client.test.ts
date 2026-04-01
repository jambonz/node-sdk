import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JambonzClient } from '../src/client/api.js';

const ACCOUNT_SID = 'test-account-sid';
const API_KEY = 'test-api-key';
const BASE = 'https://api.example.com';

function createClient() {
  return new JambonzClient({
    baseUrl: BASE,
    accountSid: ACCOUNT_SID,
    apiKey: API_KEY,
  });
}

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Bad Request',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('JambonzClient constructor', () => {
  it('strips trailing slashes from baseUrl', () => {
    const mock = mockFetch(200, []);
    globalThis.fetch = mock as unknown as typeof fetch;
    const client = new JambonzClient({ baseUrl: 'https://api.example.com/', accountSid: ACCOUNT_SID, apiKey: API_KEY });
    client.calls.list();
    expect(mock).toHaveBeenCalledWith(
      expect.stringContaining('https://api.example.com/v1/'),
      expect.anything()
    );
  });

  it('sends Bearer authorization header', async () => {
    const mock = mockFetch(200, []);
    globalThis.fetch = mock as unknown as typeof fetch;
    const client = createClient();
    await client.calls.list();
    expect(mock.mock.calls[0][1].headers).toEqual(
      expect.objectContaining({ Authorization: `Bearer ${API_KEY}` })
    );
  });
});

describe('CallsResource', () => {
  describe('create', () => {
    it('POSTs to /Accounts/{sid}/Calls and returns callSid', async () => {
      const mock = mockFetch(200, { sid: 'call-123' });
      globalThis.fetch = mock as unknown as typeof fetch;
      const client = createClient();

      const sid = await client.calls.create({
        from: '+15551234567',
        to: { type: 'phone', number: '+15559876543' },
        call_hook: 'https://example.com/hook',
        speech_synthesis_vendor: 'google',
        speech_synthesis_language: 'en-US',
        speech_synthesis_voice: 'en-US-Standard-C',
        speech_recognizer_vendor: 'deepgram',
        speech_recognizer_language: 'en-US',
      });

      expect(sid).toBe('call-123');
      expect(mock).toHaveBeenCalledWith(
        `${BASE}/v1/Accounts/${ACCOUNT_SID}/Calls`,
        expect.objectContaining({ method: 'POST' })
      );
      const body = JSON.parse(mock.mock.calls[0][1].body);
      expect(body.from).toBe('+15551234567');
      expect(body.to.type).toBe('phone');
      expect(body.speech_synthesis_vendor).toBe('google');
    });
  });

  describe('list', () => {
    it('GETs /Accounts/{sid}/Calls with no filter', async () => {
      const mock = mockFetch(200, [{ call_sid: 'c1' }, { call_sid: 'c2' }]);
      globalThis.fetch = mock as unknown as typeof fetch;
      const client = createClient();

      const calls = await client.calls.list();
      expect(calls).toHaveLength(2);
      expect(mock).toHaveBeenCalledWith(
        `${BASE}/v1/Accounts/${ACCOUNT_SID}/Calls`,
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('appends query params when filter is provided', async () => {
      const mock = mockFetch(200, []);
      globalThis.fetch = mock as unknown as typeof fetch;
      const client = createClient();

      await client.calls.list({ direction: 'inbound', callStatus: 'in-progress' });
      const url = mock.mock.calls[0][0] as string;
      expect(url).toContain('direction=inbound');
      expect(url).toContain('callStatus=in-progress');
    });
  });

  describe('get', () => {
    it('GETs /Accounts/{sid}/Calls/{callSid}', async () => {
      const callInfo = { call_sid: 'call-456', call_status: 'in-progress', from: '+1555', to: '+1666', direction: 'outbound' };
      const mock = mockFetch(200, callInfo);
      globalThis.fetch = mock as unknown as typeof fetch;
      const client = createClient();

      const result = await client.calls.get('call-456');
      expect(result.call_sid).toBe('call-456');
      expect(mock).toHaveBeenCalledWith(
        `${BASE}/v1/Accounts/${ACCOUNT_SID}/Calls/call-456`,
        expect.objectContaining({ method: 'GET' })
      );
    });
  });

  describe('count', () => {
    it('GETs /Accounts/{sid}/CallCount', async () => {
      const mock = mockFetch(200, { inbound: 3, outbound: 5 });
      globalThis.fetch = mock as unknown as typeof fetch;
      const client = createClient();

      const result = await client.calls.count();
      expect(result).toEqual({ inbound: 3, outbound: 5 });
      expect(mock).toHaveBeenCalledWith(
        `${BASE}/v1/Accounts/${ACCOUNT_SID}/CallCount`,
        expect.objectContaining({ method: 'GET' })
      );
    });
  });

  describe('update', () => {
    it('PUTs to /Accounts/{sid}/Calls/{callSid}', async () => {
      const mock = mockFetch(200, {});
      globalThis.fetch = mock as unknown as typeof fetch;
      const client = createClient();

      await client.calls.update('call-789', { mute_status: 'mute' });
      expect(mock).toHaveBeenCalledWith(
        `${BASE}/v1/Accounts/${ACCOUNT_SID}/Calls/call-789`,
        expect.objectContaining({ method: 'PUT' })
      );
      const body = JSON.parse(mock.mock.calls[0][1].body);
      expect(body.mute_status).toBe('mute');
    });
  });

  describe('delete', () => {
    it('DELETEs /Accounts/{sid}/Calls/{callSid}', async () => {
      const mock = mockFetch(204, {});
      globalThis.fetch = mock as unknown as typeof fetch;
      const client = createClient();

      await client.calls.delete('call-789');
      expect(mock).toHaveBeenCalledWith(
        `${BASE}/v1/Accounts/${ACCOUNT_SID}/Calls/call-789`,
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('convenience methods', () => {
    it('redirect sends call_hook in update', async () => {
      const mock = mockFetch(200, {});
      globalThis.fetch = mock as unknown as typeof fetch;
      const client = createClient();

      await client.calls.redirect('call-1', 'https://example.com/new');
      const body = JSON.parse(mock.mock.calls[0][1].body);
      expect(body.call_hook).toBe('https://example.com/new');
    });

    it('whisper sends whisper verb in update', async () => {
      const mock = mockFetch(200, {});
      globalThis.fetch = mock as unknown as typeof fetch;
      const client = createClient();

      await client.calls.whisper('call-1', { verb: 'say', text: 'Hello' });
      const body = JSON.parse(mock.mock.calls[0][1].body);
      expect(body.whisper).toEqual({ verb: 'say', text: 'Hello' });
    });

    it('mute sends mute_status in update', async () => {
      const mock = mockFetch(200, {});
      globalThis.fetch = mock as unknown as typeof fetch;
      const client = createClient();

      await client.calls.mute('call-1', 'unmute');
      const body = JSON.parse(mock.mock.calls[0][1].body);
      expect(body.mute_status).toBe('unmute');
    });

    it('noiseIsolation sends noise_isolation_status in update', async () => {
      const mock = mockFetch(200, {});
      globalThis.fetch = mock as unknown as typeof fetch;
      const client = createClient();

      await client.calls.noiseIsolation('call-1', 'enable');
      const body = JSON.parse(mock.mock.calls[0][1].body);
      expect(body.noise_isolation_status).toBe('enable');
    });

    it('noiseIsolation maps opts to flat noise_isolation_ fields', async () => {
      const mock = mockFetch(200, {});
      globalThis.fetch = mock as unknown as typeof fetch;
      const client = createClient();

      await client.calls.noiseIsolation('call-1', 'enable', {
        vendor: 'krisp',
        level: 80,
        model: 'custom-model',
      });
      const body = JSON.parse(mock.mock.calls[0][1].body);
      expect(body.noise_isolation_status).toBe('enable');
      expect(body.noise_isolation_vendor).toBe('krisp');
      expect(body.noise_isolation_level).toBe(80);
      expect(body.noise_isolation_model).toBe('custom-model');
    });

    it('noiseIsolation omits undefined opts fields', async () => {
      const mock = mockFetch(200, {});
      globalThis.fetch = mock as unknown as typeof fetch;
      const client = createClient();

      await client.calls.noiseIsolation('call-1', 'disable');
      const body = JSON.parse(mock.mock.calls[0][1].body);
      expect(body.noise_isolation_status).toBe('disable');
      expect(body).not.toHaveProperty('noise_isolation_vendor');
      expect(body).not.toHaveProperty('noise_isolation_level');
      expect(body).not.toHaveProperty('noise_isolation_model');
    });
  });
});

describe('ConferencesResource', () => {
  it('GETs /Accounts/{sid}/Conferences', async () => {
    const mock = mockFetch(200, ['conf-1', 'conf-2']);
    globalThis.fetch = mock as unknown as typeof fetch;
    const client = createClient();

    const result = await client.conferences.list();
    expect(result).toEqual(['conf-1', 'conf-2']);
    expect(mock).toHaveBeenCalledWith(
      `${BASE}/v1/Accounts/${ACCOUNT_SID}/Conferences`,
      expect.objectContaining({ method: 'GET' })
    );
  });
});

describe('QueuesResource', () => {
  it('GETs /Accounts/{sid}/Queues', async () => {
    const mock = mockFetch(200, [{ name: 'support', length: '3' }]);
    globalThis.fetch = mock as unknown as typeof fetch;
    const client = createClient();

    const result = await client.queues.list();
    expect(result).toEqual([{ name: 'support', length: '3' }]);
  });

  it('appends search param when provided', async () => {
    const mock = mockFetch(200, []);
    globalThis.fetch = mock as unknown as typeof fetch;
    const client = createClient();

    await client.queues.list('support');
    const url = mock.mock.calls[0][0] as string;
    expect(url).toContain('search=support');
  });
});

describe('error handling', () => {
  it('includes response body in error message', async () => {
    const mock = mockFetch(400, { msg: 'missing from parameter' });
    globalThis.fetch = mock as unknown as typeof fetch;
    const client = createClient();

    await expect(client.calls.create({
      from: '',
      to: { type: 'phone', number: '+1555' },
    })).rejects.toThrow('missing from parameter');
  });

  it('throws on 404', async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: () => Promise.resolve('call not found'),
    });
    globalThis.fetch = mock as unknown as typeof fetch;
    const client = createClient();

    await expect(client.calls.get('nonexistent')).rejects.toThrow('404 Not Found');
  });
});
