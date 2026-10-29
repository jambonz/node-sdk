import { describe, it, expect, afterEach } from 'vitest';
import http from 'http';
import WebSocket from 'ws';
import { pino } from 'pino';
import { createHarness, SentenceSplitter, type HarnessOptions, type HarnessServer } from '../src/harness/index.js';

/* ---------------- a fake OpenAI-compatible streaming server ---------------- */

type Step = Record<string, unknown> | { delayMs: number };
interface ModelRequest { body: Record<string, unknown>; aborted: boolean; auth?: string }

const text = (content: string) => ({ id: 'chatcmpl-1', object: 'chat.completion.chunk', model: 'fake', choices: [{ index: 0, delta: { content }, finish_reason: null }] });
const toolCall = (id: string, name: string, args: unknown) => ({
  id: 'chatcmpl-1', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: null }],
});
const finish = (reason = 'stop') => ({ id: 'chatcmpl-1', choices: [{ index: 0, delta: {}, finish_reason: reason }] });
const usage = (prompt: number, completion: number) => ({ id: 'chatcmpl-1', choices: [], usage: { prompt_tokens: prompt, completion_tokens: completion } });

async function fakeModel(script: (req: ModelRequest, n: number) => Step[]) {
  const requests: ModelRequest[] = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => (raw += d));
    req.on('end', async () => {
      const r: ModelRequest = { body: JSON.parse(raw), aborted: false, auth: req.headers.authorization };
      requests.push(r);
      res.on('close', () => { if (!res.writableFinished) r.aborted = true; });
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (const step of script(r, requests.length - 1)) {
        if (res.destroyed) return;
        if ('delayMs' in step) await new Promise((x) => setTimeout(x, step.delayMs as number));
        else res.write(`data: ${JSON.stringify(step)}\n\n`);
      }
      if (!res.destroyed) res.end('data: [DONE]\n\n');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as { port: number };
  return {
    requests,
    baseURL: `http://127.0.0.1:${port}/v1`,
    close: () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }),
  };
}

/* ---------------- a fake jambonz (feature-server) client ---------------- */

type Msg = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function connect(port: number, opts: { key?: string; protocol?: string } = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/`, opts.protocol ?? 'harness.jambonz.org', {
    headers: opts.key ? { Authorization: `Bearer ${opts.key}` } : {},
  });
  const msgs: Msg[] = [];
  const waiters: Array<() => void> = [];
  ws.on('message', (d) => { msgs.push(JSON.parse(d.toString())); waiters.splice(0).forEach((w) => w()); });
  await new Promise<void>((resolve, reject) => { ws.once('open', () => resolve()); ws.once('error', reject); });
  const client = {
    ws,
    msgs,
    send: (type: string, data: Msg = {}) => ws.send(JSON.stringify({ type, call_sid: 'call-1', ...data })),
    async waitFor(pred: (m: Msg) => boolean, timeoutMs = 3000): Promise<Msg> {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const found = msgs.find(pred);
        if (found) return found;
        if (Date.now() > deadline) throw new Error(`timed out; got ${JSON.stringify(msgs.map((m) => m.type))}`);
        await new Promise<void>((r) => { waiters.push(r); setTimeout(r, 50); });
      }
    },
    replyText: (replyId: string) => msgs.filter((m) => m.type === 'reply:chunk' && m.reply_id === replyId).map((m) => m.chunk.choices[0].delta.content).join(''),
    start: (data: Msg = {}) => client.send('session:start', { protocol: 1, from: '+15085550100', to: '+15085550199', direction: 'inbound', ...data }),
  };
  return client;
}

/* ---------------- fixtures ---------------- */

let harness: HarnessServer | undefined;
let model: Awaited<ReturnType<typeof fakeModel>> | undefined;
const clients: WebSocket[] = [];

async function setup(script: (req: ModelRequest, n: number) => Step[], opts: Partial<HarnessOptions> = {}) {
  model = await fakeModel(script);
  harness = createHarness({
    model: 'test-model',
    instructions: 'You answer calls for Acme.',
    client: { apiKey: 'sk-test', baseURL: model.baseURL },
    logger: pino({ level: 'silent' }),
    ...opts,
  });
  const { port } = await harness.listen({ port: 0, host: '127.0.0.1' });
  return port;
}

async function call(port: number, startData: Msg = {}, key?: string) {
  const c = await connect(port, { key });
  clients.push(c.ws);
  c.start(startData);
  return c;
}

afterEach(async () => {
  clients.splice(0).forEach((ws) => ws.terminate());
  await harness?.close();
  await model?.close();
  harness = undefined;
  model = undefined;
});

const lastUserOrTool = (req: ModelRequest) => (req.body.messages as Msg[]).at(-1);

/* ---------------- tests ---------------- */

describe('harness: turns', () => {
  it('greeting turn: asks the model to greet, passes chunks through, ends with reply:done and a turn record', async () => {
    const port = await setup(() => [text('Thanks for calling Acme.'), text(' How can I help?'), finish(), usage(42, 9)]);
    const c = await call(port);
    c.send('turn:start', { turn_id: 1, input: { type: 'greeting' } });

    const done = await c.waitFor((m) => m.type === 'reply:done');
    expect(done).toMatchObject({ reply_id: 'r1', turn_id: 1 });
    expect(c.replyText('r1')).toBe('Thanks for calling Acme. How can I help?');
    const firstChunk = c.msgs.find((m) => m.type === 'reply:chunk')!;
    expect(firstChunk.turn_id).toBe(1);
    expect(firstChunk.chunk).toMatchObject({ id: 'chatcmpl-1', model: 'fake' }); // the model's own chunk

    const req = model!.requests[0];
    expect(req.auth).toBe('Bearer sk-test');
    expect(req.body).toMatchObject({ model: 'test-model', stream: true });
    expect((req.body.messages as Msg[])[0]).toEqual({ role: 'system', content: 'You answer calls for Acme.' });
    expect(lastUserOrTool(req)!.role).toBe('user');

    const tr = done.turn_record;
    expect(tr.model_calls).toHaveLength(1);
    expect(tr.model_calls[0]).toMatchObject({ model: 'test-model', purpose: 'reply', input_tokens: 42, output_tokens: 9 });
    expect(tr.model_calls[0].first_token_ms).toBeTypeOf('number');
    expect(tr.steps.map((s: Msg) => s.name)).toEqual(['model']);
  });

  it('a fixed greeting is spoken without calling the model', async () => {
    const port = await setup(() => [text('unused')], { greeting: 'Hello from Acme.' });
    const c = await call(port);
    c.send('turn:start', { turn_id: 1, input: { type: 'greeting' } });
    await c.waitFor((m) => m.type === 'reply:done');
    expect(c.replyText('r1')).toBe('Hello from Acme.');
    expect(model!.requests).toHaveLength(0);
  });

  it('speech turn: keeps the conversation history across turns', async () => {
    const port = await setup((_r, n) => [text(n === 0 ? 'Hi there.' : 'Sure, I can help with that.'), finish()]);
    const c = await call(port);
    c.send('turn:start', { turn_id: 1, input: { type: 'greeting' } });
    await c.waitFor((m) => m.type === 'reply:done' && m.turn_id === 1);
    c.send('turn:start', { turn_id: 2, input: { type: 'speech', text: 'I want to report an outage' } });
    await c.waitFor((m) => m.type === 'reply:done' && m.turn_id === 2);

    expect(c.replyText('r2')).toBe('Sure, I can help with that.');
    const msgs = model!.requests[1].body.messages as Msg[];
    expect(msgs.map((m) => m.role)).toEqual(['system', 'assistant', 'user']);
    expect(msgs[1].content).toBe('Hi there.');
    expect(msgs[2].content).toBe('I want to report an outage');
  });

  it('turn:cancel aborts the model stream, sends nothing more, and barge-in trims history to what was heard', async () => {
    const port = await setup((_r, n) => (n === 0
      ? [text('Thanks. I can see an outage'), { delayMs: 300 }, text(' reported on Main Street, and more.'), { delayMs: 300 }, finish()]
      : [text('Tomorrow.'), finish()]));
    const c = await call(port);
    c.send('turn:start', { turn_id: 3, input: { type: 'speech', text: "It's at 12 Main Street" } });
    await c.waitFor((m) => m.type === 'reply:chunk' && m.turn_id === 3);
    c.send('event', { name: 'user_interruption', turn_id: 3, reply_id: 'r3', spoken: 'Thanks. I can see', unspoken: ' an outage' });
    c.send('turn:cancel', { turn_id: 3, reason: 'barge_in' });

    await new Promise((r) => setTimeout(r, 450));
    expect(model!.requests[0].aborted).toBe(true);
    expect(c.msgs.filter((m) => m.turn_id === 3 && m.type === 'reply:chunk')).toHaveLength(1);
    expect(c.msgs.find((m) => m.type === 'reply:done' && m.turn_id === 3)).toBeUndefined();

    c.send('turn:start', { turn_id: 4, input: { type: 'speech', text: 'When will it be fixed?' } });
    await c.waitFor((m) => m.type === 'reply:done' && m.turn_id === 4);
    const msgs = model!.requests[1].body.messages as Msg[];
    expect(msgs.slice(1)).toEqual([
      { role: 'user', content: "It's at 12 Main Street" },
      { role: 'assistant', content: 'Thanks. I can see' },
      { role: 'user', content: 'When will it be fixed?' },
    ]);
  });

  it('beforeModel can route, switch prompt and model, and answer without a model', async () => {
    const port = await setup(() => [text('Routed answer.'), finish()], {
      beforeModel: (turn) => {
        if (turn.text.includes('hours')) return { reply: 'We are open nine to five.', route: 'faq' };
        return { route: 'billing', instructions: 'You handle billing.', model: 'billing-model' };
      },
    });
    const c = await call(port);
    c.send('turn:start', { turn_id: 1, input: { type: 'speech', text: 'What are your hours?' } });
    const d1 = await c.waitFor((m) => m.type === 'reply:done' && m.turn_id === 1);
    expect(c.replyText('r1')).toBe('We are open nine to five.');
    expect(d1.turn_record.route).toBe('faq');
    expect(d1.turn_record.steps.map((s: Msg) => s.name)).toEqual(['beforeModel']);
    expect(model!.requests).toHaveLength(0);

    c.send('turn:start', { turn_id: 2, input: { type: 'speech', text: 'My bill is wrong' } });
    const d2 = await c.waitFor((m) => m.type === 'reply:done' && m.turn_id === 2);
    expect(d2.turn_record.route).toBe('billing');
    expect(model!.requests[0].body.model).toBe('billing-model');
    expect((model!.requests[0].body.messages as Msg[])[0].content).toBe('You handle billing.');
  });
});

describe('harness: tools', () => {
  it('runs an agent Studio tool via tool:call and feeds tool:result back to the model', async () => {
    const studioTool = { type: 'function', function: { name: 'get_weather', description: 'Weather', parameters: { type: 'object', properties: { city: { type: 'string' } } } } };
    const port = await setup((_r, n) => (n === 0
      ? [toolCall('call_abc', 'get_weather', { city: 'Boston' }), finish('tool_calls')]
      : [text('It is sunny in Boston.'), finish()]));
    const c = await call(port, { tools: [studioTool] });
    c.send('turn:start', { turn_id: 1, input: { type: 'speech', text: 'Weather in Boston?' } });

    const tc = await c.waitFor((m) => m.type === 'tool:call');
    expect(tc).toMatchObject({ turn_id: 1, name: 'get_weather', args: { city: 'Boston' } });
    expect((model!.requests[0].body.tools as Msg[]).map((t) => t.function.name)).toEqual(['get_weather']);
    c.send('tool:result', { call_id: tc.call_id, result: { forecast: 'sunny' } });

    const done = await c.waitFor((m) => m.type === 'reply:done');
    expect(c.replyText('r1')).toBe('It is sunny in Boston.');
    const msgs = model!.requests[1].body.messages as Msg[];
    expect(msgs.at(-2)).toMatchObject({ role: 'assistant', tool_calls: [{ id: 'call_abc', function: { name: 'get_weather' } }] });
    expect(msgs.at(-1)).toEqual({ role: 'tool', tool_call_id: 'call_abc', content: '{"forecast":"sunny"}' });
    expect(done.turn_record.model_calls).toHaveLength(2);
    expect(done.turn_record.steps.map((s: Msg) => s.name)).toEqual(['model', 'tool:get_weather', 'model']);
    expect(done.turn_record.own_tools).toBeUndefined();
  });

  it('a turn cancelled while a tool runs leaves valid history for the next turn', async () => {
    const studioTool = { type: 'function', function: { name: 'slow', parameters: { type: 'object', properties: {} } } };
    const port = await setup((_r, n) => (n === 0 ? [toolCall('call_s', 'slow', {}), finish('tool_calls')] : [text('OK.'), finish()]));
    const c = await call(port, { tools: [studioTool] });
    c.send('turn:start', { turn_id: 1, input: { type: 'speech', text: 'do the slow thing' } });
    await c.waitFor((m) => m.type === 'tool:call');
    c.send('turn:cancel', { turn_id: 1, reason: 'barge_in' });
    c.send('turn:start', { turn_id: 2, input: { type: 'speech', text: 'never mind' } });
    await c.waitFor((m) => m.type === 'reply:done' && m.turn_id === 2);
    const msgs = model!.requests[1].body.messages as Msg[];
    expect(msgs.slice(1).map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'user']);
    expect(msgs[3]).toEqual({ role: 'tool', tool_call_id: 'call_s', content: '{"error":"cancelled"}' });
  });

  it('a Studio tool error comes back to the model as an error result', async () => {
    const studioTool = { type: 'function', function: { name: 'book', parameters: { type: 'object', properties: {} } } };
    const port = await setup((_r, n) => (n === 0 ? [toolCall('call_1', 'book', {}), finish('tool_calls')] : [text('That did not work.'), finish()]));
    const c = await call(port, { tools: [studioTool] });
    c.send('turn:start', { turn_id: 1, input: { type: 'speech', text: 'book it' } });
    const tc = await c.waitFor((m) => m.type === 'tool:call');
    c.send('tool:result', { call_id: tc.call_id, error: 'toolHook timed out' });
    const done = await c.waitFor((m) => m.type === 'reply:done');
    expect((model!.requests[1].body.messages as Msg[]).at(-1)!.content).toBe('{"error":"toolHook timed out"}');
    expect(done.turn_record.steps[1]).toMatchObject({ name: 'tool:book', result: 'error' });
  });

  it("runs the developer's own tool in-process and records it in own_tools", async () => {
    const seen: unknown[] = [];
    const port = await setup((_r, n) => (n === 0
      ? [text('Let me check. '), toolCall('call_x', 'lookup_outage', { address: '12 Main St' }), finish('tool_calls')]
      : [text('There is an outage until 5pm.'), finish()]), {
      tools: {
        lookup_outage: {
          description: 'Find outages at an address',
          parameters: { type: 'object', properties: { address: { type: 'string' } }, required: ['address'] },
          run: (args, ctx) => { seen.push(args); ctx.record('flags', ['outage_found']); return { until: '17:00' }; },
        },
      },
    });
    const c = await call(port);
    c.send('turn:start', { turn_id: 1, input: { type: 'speech', text: 'Is there an outage at 12 Main St?' } });
    const done = await c.waitFor((m) => m.type === 'reply:done');

    expect(seen).toEqual([{ address: '12 Main St' }]);
    expect(c.msgs.find((m) => m.type === 'tool:call')).toBeUndefined();
    expect(c.replyText('r1')).toBe('Let me check. There is an outage until 5pm.');
    const offered = (model!.requests[0].body.tools as Msg[])[0];
    expect(offered).toMatchObject({ type: 'function', function: { name: 'lookup_outage', description: 'Find outages at an address' } });
    const msgs = model!.requests[1].body.messages as Msg[];
    expect(msgs.at(-2)).toMatchObject({ role: 'assistant', content: 'Let me check. ' });
    expect(msgs.at(-1)).toEqual({ role: 'tool', tool_call_id: 'call_x', content: '{"until":"17:00"}' });
    expect(done.turn_record.own_tools).toEqual([{ name: 'lookup_outage', ok: true, ms: expect.any(Number) }]);
    expect(done.turn_record.flags).toEqual(['outage_found']);
  });
});

describe('harness: checks and records', () => {
  it('checkSentence false stops the reply before the failing sentence is spoken', async () => {
    const checked: string[] = [];
    const port = await setup(() => [text('Hello there. Your acc'), text('ount is 1234. '), { delayMs: 100 }, text('Anything else?'), finish()], {
      checkSentence: (s) => { checked.push(s); return !/\d{4}/.test(s); },
    });
    const c = await call(port);
    c.send('turn:start', { turn_id: 1, input: { type: 'speech', text: 'What is my account number?' } });
    const done = await c.waitFor((m) => m.type === 'reply:done');

    expect(c.replyText('r1')).toBe('Hello there. ');
    expect(checked).toEqual(['Hello there.', 'Your account is 1234.']);
    expect(done.turn_record.steps.find((s: Msg) => s.name === 'output_check')).toMatchObject({ result: 'fail', detail: { sentences: 2 } });
  });

  it('checkSentence returning a string speaks that instead', async () => {
    const port = await setup(() => [text('Hi. Call 555-1234 now. Bye.'), finish()], {
      checkSentence: (s) => (s.includes('555') ? 'Call our main number.' : true),
    });
    const c = await call(port);
    c.send('turn:start', { turn_id: 1, input: { type: 'speech', text: 'number?' } });
    const done = await c.waitFor((m) => m.type === 'reply:done');
    expect(c.replyText('r1')).toBe('Hi. Call our main number. Bye.');
    expect(done.turn_record.steps.at(-1)).toMatchObject({ name: 'output_check', result: 'replaced' });
  });

  it('afterTurn sees the reply and can add to the turn record', async () => {
    const port = await setup(() => [text('Done.'), finish(), usage(10, 2)], {
      onSessionStart: (_s, ctx) => { ctx.state.set('tenant', 'acme'); },
      beforeModel: () => ({ route: 'chat' }),
      afterTurn: (turn, ctx) => { ctx.record('note', `${ctx.state.get('tenant')}: ${turn.reply}`); ctx.record('procedures', ['general']); },
    });
    const c = await call(port);
    c.send('turn:start', { turn_id: 1, input: { type: 'speech', text: 'hi' } });
    const done = await c.waitFor((m) => m.type === 'reply:done');
    expect(done.turn_record).toMatchObject({
      route: 'chat',
      note: 'acme: Done.',
      procedures: ['general'],
      steps: [{ name: 'beforeModel' }, { name: 'model' }],
      model_calls: [{ model: 'test-model', input_tokens: 10, output_tokens: 2 }],
    });
  });

  it('a model failure is logged, recorded and answered with the error reply', async () => {
    const port = await setup(() => [], { client: { apiKey: 'x', baseURL: 'http://127.0.0.1:1/v1' }, errorReply: 'Sorry.' });
    const c = await call(port);
    c.send('turn:start', { turn_id: 1, input: { type: 'speech', text: 'hi' } });
    const done = await c.waitFor((m) => m.type === 'reply:done');
    expect(c.replyText('r1')).toBe('Sorry.');
    expect(done.turn_record.error).toBeTypeOf('string');
  });
});

describe('harness: events, commands, silence', () => {
  it('onEvent handlers can send commands and get their results', async () => {
    const results: unknown[] = [];
    const port = await setup(() => [], {
      onEvent: {
        dtmf: async (e, ctx) => {
          ctx.state.set('pin', e.digits);
          results.push(await ctx.command('transfer', { to: '+15085550100' }));
        },
      },
    });
    const c = await call(port);
    c.send('event', { name: 'dtmf', digits: '1234', duration_ms: 400 });
    const cmd = await c.waitFor((m) => m.type === 'command');
    expect(cmd).toMatchObject({ name: 'transfer', args: { to: '+15085550100' } });
    c.send('command:result', { command_id: cmd.command_id, ok: false, error: 'busy' });
    await new Promise((r) => setTimeout(r, 50));
    expect(results).toEqual([{ ok: false, error: 'busy' }]);
  });

  it('an application_update reaches its handler with the update type jambonz sends', async () => {
    const seen: unknown[] = [];
    const port = await setup(() => [], {
      onEvent: { application_update: (e) => { seen.push([e.update_type, e.data]); } },
    });
    const c = await call(port);
    c.send('event', { name: 'application_update', update_type: 'inject_context', data: { text: 'VIP caller' } });
    await new Promise((r) => setTimeout(r, 50));
    expect(seen).toEqual([['inject_context', { text: 'VIP caller' }]]);
  });

  it('default silence: asks once, then says goodbye and hangs up after it has been spoken', async () => {
    const port = await setup(() => []);
    const c = await call(port);
    c.send('event', { name: 'silence', seconds: 10, streak: 1 });
    const first = await c.waitFor((m) => m.type === 'reply:chunk');
    expect(first.turn_id).toBeUndefined();
    expect(first.chunk.choices[0].delta.content).toBe('Are you still there?');

    c.send('event', { name: 'silence', seconds: 10, streak: 2 });
    const bye = await c.waitFor((m) => m.type === 'reply:chunk' && m.reply_id !== first.reply_id);
    expect(bye.chunk.choices[0].delta.content).toMatch(/Goodbye/);
    await new Promise((r) => setTimeout(r, 50));
    expect(c.msgs.find((m) => m.type === 'command')).toBeUndefined(); // waits for the goodbye to play
    c.send('event', { name: 'reply_spoken', reply_id: bye.reply_id });
    const hangup = await c.waitFor((m) => m.type === 'command');
    expect(hangup).toMatchObject({ name: 'hangup', args: { reason: 'no_input' } });
  });

  it('no_input turns follow the same policy, answered in the turn', async () => {
    const port = await setup(() => []);
    const c = await call(port);
    c.send('turn:start', { turn_id: 2, input: { type: 'no_input' } });
    await c.waitFor((m) => m.type === 'reply:done' && m.turn_id === 2);
    expect(c.replyText('r2')).toBe('Are you still there?');
    c.send('turn:start', { turn_id: 3, input: { type: 'no_input' } });
    await c.waitFor((m) => m.type === 'reply:done' && m.turn_id === 3);
    c.send('event', { name: 'reply_spoken', reply_id: 'r3' });
    expect(await c.waitFor((m) => m.type === 'command')).toMatchObject({ name: 'hangup' });
  });

  it('onEvent.silence overrides the default', async () => {
    const seen: number[] = [];
    const port = await setup(() => [], { onEvent: { silence: (e) => { seen.push(e.streak); } } });
    const c = await call(port);
    c.send('event', { name: 'silence', seconds: 10, streak: 1 });
    c.send('event', { name: 'silence', seconds: 10, streak: 2 });
    await new Promise((r) => setTimeout(r, 100));
    expect(seen).toEqual([1, 2]);
    expect(c.msgs).toHaveLength(0);
  });

  it('ignores unknown message types and speech:start/transcript', async () => {
    const port = await setup(() => [text('ok'), finish()]);
    const c = await call(port);
    c.send('something:new', { foo: 1 });
    c.send('speech:start', { turn_id: 1 });
    c.send('transcript', { turn_id: 1, text: 'hel', final: false });
    c.send('turn:start', { turn_id: 1, input: { type: 'speech', text: 'hello' } });
    await c.waitFor((m) => m.type === 'reply:done');
    expect(c.replyText('r1')).toBe('ok');
  });

  it('closes with 4000 on an unsupported protocol version', async () => {
    const port = await setup(() => []);
    const c = await call(port, { protocol: 2 });
    const code = await new Promise<number>((r) => c.ws.once('close', (code) => r(code)));
    expect(code).toBe(4000);
  });
});

describe('harness: authentication', () => {
  it('rejects a connection without the right key and accepts the right one', async () => {
    const port = await setup(() => [], { apiKey: 'secret-key' });
    await expect(connect(port)).rejects.toThrow(/401/);
    await expect(connect(port, { key: 'wrong-key!' })).rejects.toThrow(/401/);
    const ok = await connect(port, { key: 'secret-key' });
    clients.push(ok.ws);
    expect(ok.ws.protocol).toBe('harness.jambonz.org');
  });

  it('rejects a connection that does not offer the harness subprotocol', async () => {
    const port = await setup(() => []);
    await expect(connect(port, { protocol: 'ws.jambonz.org' })).rejects.toThrow(/400/);
  });
});

describe('SentenceSplitter', () => {
  it('splits on sentence ends across pushes and keeps abbreviations together', () => {
    const s = new SentenceSplitter();
    expect(s.push('Dr. Smith is in. Call')).toEqual(['Dr. Smith is in. ']);
    expect(s.push(' him at 3.5 past! OK?')).toEqual(['Call him at 3.5 past! ']);
    expect(s.flush()).toBe('OK?');
  });
});
