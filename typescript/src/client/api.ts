/**
 * JambonzClient — REST API client for the jambonz platform.
 * Uses native fetch (Node 18+).
 */

import type {
  CallInfo,
  CreateCallRequest,
  UpdateCallRequest,
  SendMessageRequest,
  MessageInfo,
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

  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: this.headers,
    });
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status} ${res.statusText}`);
    return res.json() as Promise<T>;
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`POST ${path} failed: ${res.status} ${res.statusText}`);
    return res.json() as Promise<T>;
  }

  async put(path: string, body: unknown): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`PUT ${path} failed: ${res.status} ${res.statusText}`);
  }

  async del(path: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers: this.headers,
    });
    if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status} ${res.statusText}`);
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

  /** Get info about an active call. */
  async get(callSid: string): Promise<CallInfo> {
    return this.http.get<CallInfo>(
      `/Accounts/${this.accountSid}/Calls/${callSid}`
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
}

export class MessagesResource {
  constructor(private http: HttpClient, private accountSid: string) {}

  /** Send an SMS/MMS message. */
  async create(opts: SendMessageRequest): Promise<MessageInfo> {
    return this.http.post<MessageInfo>(
      `/Accounts/${this.accountSid}/Messages`,
      opts
    );
  }
}

export class JambonzClient {
  readonly calls: CallsResource;
  readonly messages: MessagesResource;

  constructor(opts: ClientOptions) {
    const http = new HttpClient(opts);
    this.calls = new CallsResource(http, opts.accountSid);
    this.messages = new MessagesResource(http, opts.accountSid);
  }
}
