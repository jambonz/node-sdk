/**
 * JambonzClient — REST API client for the jambonz platform.
 * Uses native fetch (Node 18+).
 */

import type {
  CallInfo,
  CallCount,
  CreateCallRequest,
  UpdateCallRequest,
  ListCallsFilter,
  QueueInfo,
} from '../types/rest.js';
import type { ActionHook } from '../types/components.js';
import type { Verb } from '../types/verbs.js';

export interface ClientOptions {
  /** Base URL of the jambonz API (e.g. 'https://api.jambonz.us'). */
  baseUrl: string;
  /** Account SID. */
  accountSid: string;
  /** API key (Bearer token). */
  apiKey: string;
}

class HttpClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(opts: ClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '') + '/v1';
    this.headers = {
      'Authorization': `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  private async throwError(method: string, path: string, res: Response): Promise<never> {
    let detail = '';
    try { detail = `: ${await res.text()}`; } catch { /* ignore */ }
    throw new Error(`${method} ${path} failed: ${res.status} ${res.statusText}${detail}`);
  }

  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: this.headers,
    });
    if (!res.ok) await this.throwError('GET', path, res);
    return res.json() as Promise<T>;
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) await this.throwError('POST', path, res);
    return res.json() as Promise<T>;
  }

  async put(path: string, body: unknown): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) await this.throwError('PUT', path, res);
  }

  async del(path: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers: this.headers,
    });
    if (!res.ok) await this.throwError('DELETE', path, res);
  }
}

export class CallsResource {
  constructor(private http: HttpClient, private accountSid: string) {}

  /** Create a new outbound call. */
  async create(opts: CreateCallRequest): Promise<string> {
    const result = await this.http.post<{ sid: string }>(
      `/Accounts/${this.accountSid}/Calls`,
      opts
    );
    return result.sid;
  }

  /** List active calls, optionally filtered. */
  async list(filter?: ListCallsFilter): Promise<CallInfo[]> {
    const params = new URLSearchParams();
    if (filter?.direction) params.set('direction', filter.direction);
    if (filter?.from) params.set('from', filter.from);
    if (filter?.to) params.set('to', filter.to);
    if (filter?.callStatus) params.set('callStatus', filter.callStatus);
    const qs = params.toString();
    return this.http.get<CallInfo[]>(
      `/Accounts/${this.accountSid}/Calls${qs ? `?${qs}` : ''}`
    );
  }

  /** Get info about an active call. */
  async get(callSid: string): Promise<CallInfo> {
    return this.http.get<CallInfo>(
      `/Accounts/${this.accountSid}/Calls/${callSid}`
    );
  }

  /** Get count of active inbound and outbound calls. */
  async count(): Promise<CallCount> {
    return this.http.get<CallCount>(
      `/Accounts/${this.accountSid}/CallCount`
    );
  }

  /** Update an active call (redirect, mute, hangup, etc). */
  async update(callSid: string, opts: UpdateCallRequest): Promise<void> {
    return this.http.put(
      `/Accounts/${this.accountSid}/Calls/${callSid}`,
      opts
    );
  }

  /** Terminate a call. */
  async delete(callSid: string): Promise<void> {
    return this.http.del(
      `/Accounts/${this.accountSid}/Calls/${callSid}`
    );
  }

  /** Redirect call execution to a new webhook URL. */
  async redirect(callSid: string, hook: ActionHook): Promise<void> {
    return this.update(callSid, { call_hook: hook });
  }

  /** Inject a whisper verb (say/play) to one party on the call. */
  async whisper(callSid: string, verb: Verb): Promise<void> {
    return this.update(callSid, { whisper: verb });
  }

  /** Mute or unmute a call. */
  async mute(callSid: string, status: 'mute' | 'unmute'): Promise<void> {
    return this.update(callSid, { mute_status: status });
  }

  /** Send a mid-conversation update to an active pipeline verb. */
  async updatePipeline(callSid: string, data: NonNullable<UpdateCallRequest['pipeline_update']>): Promise<void> {
    return this.update(callSid, { pipeline_update: data });
  }

  /** Enable or disable server-side noise isolation. */
  async noiseIsolation(
    callSid: string,
    status: 'enable' | 'disable',
    opts?: { vendor?: string; level?: number; model?: string }
  ): Promise<void> {
    return this.update(callSid, {
      noise_isolation_status: status,
      ...(opts?.vendor ? { noise_isolation_vendor: opts.vendor } : {}),
      ...(opts?.level !== undefined ? { noise_isolation_level: opts.level } : {}),
      ...(opts?.model ? { noise_isolation_model: opts.model } : {}),
    });
  }
}

export class ConferencesResource {
  constructor(private http: HttpClient, private accountSid: string) {}

  /** List active conferences. */
  async list(): Promise<string[]> {
    return this.http.get<string[]>(
      `/Accounts/${this.accountSid}/Conferences`
    );
  }
}

export class QueuesResource {
  constructor(private http: HttpClient, private accountSid: string) {}

  /** List active queues. */
  async list(search?: string): Promise<QueueInfo[]> {
    const qs = search ? `?search=${encodeURIComponent(search)}` : '';
    return this.http.get<QueueInfo[]>(
      `/Accounts/${this.accountSid}/Queues${qs}`
    );
  }
}

/**
 * REST API client for the jambonz platform.
 * Provides typed methods for creating and managing calls, conferences, and queues.
 *
 * @example
 * ```typescript
 * const client = new JambonzClient({ baseUrl: 'https://api.jambonz.us', accountSid, apiKey });
 * const callSid = await client.calls.create({ from: '+15085551212', to: { type: 'phone', number: '+15085551213' } });
 * ```
 */
export class JambonzClient {
  /** Active call management (create, list, update, redirect, mute, whisper, hangup). */
  readonly calls: CallsResource;
  /** Active conference listing. */
  readonly conferences: ConferencesResource;
  /** Active queue listing. */
  readonly queues: QueuesResource;

  /**
   * @param opts - API connection options (baseUrl, accountSid, apiKey).
   */
  constructor(opts: ClientOptions) {
    const http = new HttpClient(opts);
    this.calls = new CallsResource(http, opts.accountSid);
    this.conferences = new ConferencesResource(http, opts.accountSid);
    this.queues = new QueuesResource(http, opts.accountSid);
  }
}
