/**
 * A minimal streaming client for OpenAI-compatible chat completions (`POST {baseURL}/chat/completions`
 * with `stream: true`, server-sent events). Uses the global fetch, so there is no dependency on the
 * OpenAI SDK, and works with any endpoint that speaks the same wire format.
 */

import type { ChatCompletionChunk, ChatMessage, ChatTool } from './protocol.js';

export interface ModelClientOptions {
  /** API key, sent as `Authorization: Bearer`. Default: `process.env.OPENAI_API_KEY`. */
  apiKey?: string;
  /** Base URL of the API, up to and including the version. Default: `process.env.OPENAI_BASE_URL` or `https://api.openai.com/v1`. */
  baseURL?: string;
  /** Extra headers for every request. */
  headers?: Record<string, string>;
}

export interface StreamRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ChatTool[];
  /** Extra request body fields (temperature, max_tokens, ...). */
  params?: Record<string, unknown>;
  signal: AbortSignal;
}

export class ModelError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'ModelError';
  }
}

export function createModelClient(opts: ModelClientOptions = {}) {
  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY;
  const baseURL = (opts.baseURL ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, '');

  return {
    baseURL,
    async *stream(req: StreamRequest): AsyncGenerator<ChatCompletionChunk> {
      const body: Record<string, unknown> = {
        stream_options: { include_usage: true },
        ...req.params,
        model: req.model,
        messages: req.messages,
        stream: true,
      };
      if (req.tools?.length) body.tools = req.tools;

      const res = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          ...opts.headers,
        },
        body: JSON.stringify(body),
        signal: req.signal,
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        throw new ModelError(`model request failed: ${res.status} ${text.slice(0, 500)}`, res.status);
      }

      const decoder = new TextDecoder();
      let buffer = '';
      for await (const bytes of res.body as unknown as AsyncIterable<Uint8Array>) {
        buffer += decoder.decode(bytes, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') return;
          let chunk: ChatCompletionChunk & { error?: { message?: string } };
          try {
            chunk = JSON.parse(data);
          } catch {
            throw new ModelError(`model sent an unparseable stream event: ${data.slice(0, 200)}`);
          }
          if (chunk.error) throw new ModelError(`model stream error: ${chunk.error.message ?? JSON.stringify(chunk.error)}`);
          if (!Array.isArray(chunk.choices)) chunk.choices = [];
          yield chunk;
        }
      }
    },
  };
}

export type ModelClient = ReturnType<typeof createModelClient>;
