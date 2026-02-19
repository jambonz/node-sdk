/**
 * WebSocket path-based router.
 * Routes incoming WebSocket connections to the appropriate Client based on URL path.
 */

import type { IncomingMessage } from 'http';
import type { WsClient } from './client.js';

interface Route {
  path: string;
  chunks: string[];
  client: WsClient;
}

export class WsRouter {
  private routes: Route[] = [];
  private wildcard: WsClient | null = null;

  /** Register a client for a path pattern. Use '*' for wildcard. */
  use(path: string, client: WsClient): void {
    if (path === '*') {
      this.wildcard = client;
      return;
    }

    const normalized = path.startsWith('/') ? path : `/${path}`;
    const chunks = normalized.split('/').filter(Boolean);
    this.routes.push({ path: normalized, chunks, client });
    // Sort by longest match first
    this.routes.sort((a, b) => b.chunks.length - a.chunks.length);
  }

  /** Find the matching client for a request. Returns undefined if no match. */
  route(req: IncomingMessage): WsClient | undefined {
    const pathname = req.url?.split('?')[0];
    if (!pathname) return this.wildcard ?? undefined;

    const urlChunks = pathname.split('/').filter(Boolean);

    for (const route of this.routes) {
      if (route.chunks.length > urlChunks.length) continue;

      const matched = route.chunks.every((chunk, i) => chunk === urlChunks[i]);
      if (matched) {
        // Update req.url to the remaining path
        const remaining = '/' + urlChunks.slice(route.chunks.length).join('/');
        (req as IncomingMessage & { originalUrl?: string }).originalUrl = req.url;
        req.url = remaining;
        return route.client;
      }
    }

    return this.wildcard ?? undefined;
  }
}
