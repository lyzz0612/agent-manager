import type { WsEvent } from './types';
import { buildWebSocketUrl, normalizeServerEvent } from './client';

export type WsListener = (event: WsEvent) => void;
export type WsStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';
export type WsStatusListener = (status: WsStatus) => void;

export interface WsClientOptions {
  serverUrl: string;
  token: string;
  /** Override for tests. */
  WebSocketCtor?: typeof WebSocket;
  /** Initial backoff in ms, default 500. */
  initialBackoffMs?: number;
  /** Maximum backoff in ms, default 30_000. */
  maxBackoffMs?: number;
}

/**
 * Lightweight WebSocket client with exponential-backoff reconnect.
 *
 * Design notes:
 *   - Single subscriber list, fanned out to every listener.
 *   - Reconnect indefinitely as long as `start()` has been called and `stop()`
 *     has not; `stop()` aborts both the active socket and any pending reconnect.
 *   - The wire format is assumed to be JSON messages matching `WsEvent`.
 */
export class WsClient {
  private socket: WebSocket | null = null;
  private readonly listeners = new Set<WsListener>();
  private readonly statusListeners = new Set<WsStatusListener>();
  private status: WsStatus = 'idle';

  private retryAttempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  private readonly url: string;
  private readonly WebSocketCtor: typeof WebSocket;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;

  constructor(opts: WsClientOptions) {
    this.url = buildWebSocketUrl(opts.serverUrl, opts.token);
    this.WebSocketCtor = opts.WebSocketCtor ?? (globalThis.WebSocket as typeof WebSocket);
    this.initialBackoffMs = opts.initialBackoffMs ?? 500;
    this.maxBackoffMs = opts.maxBackoffMs ?? 30_000;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.connect();
  }

  stop(): void {
    this.running = false;
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        /* ignore */
      }
      this.socket = null;
    }
    this.setStatus('closed');
  }

  subscribe(listener: WsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStatus(listener: WsStatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  getStatus(): WsStatus {
    return this.status;
  }

  /* internals */

  private connect(): void {
    if (!this.running) return;
    if (!this.WebSocketCtor) {
      this.setStatus('error');
      this.scheduleReconnect();
      return;
    }

    this.setStatus('connecting');
    let socket: WebSocket;
    try {
      socket = new this.WebSocketCtor(this.url);
    } catch (err) {
      this.setStatus('error');
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      this.retryAttempt = 0;
      this.setStatus('open');
    };

    socket.onmessage = (msg: MessageEvent) => {
      if (typeof msg.data !== 'string') return;
      try {
        const parsed = normalizeServerEvent(JSON.parse(msg.data));
        if (!parsed) return;
        for (const listener of this.listeners) {
          listener(parsed);
        }
      } catch {
        /* swallow malformed payloads — surface elsewhere if needed */
      }
    };

    socket.onerror = () => {
      this.setStatus('error');
    };

    socket.onclose = () => {
      this.socket = null;
      if (!this.running) {
        this.setStatus('closed');
        return;
      }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (!this.running) return;
    if (this.retryTimer !== null) return;
    const delay = Math.min(
      this.maxBackoffMs,
      this.initialBackoffMs * 2 ** this.retryAttempt,
    );
    this.retryAttempt += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
  }

  private setStatus(next: WsStatus): void {
    if (this.status === next) return;
    this.status = next;
    for (const listener of this.statusListeners) {
      listener(next);
    }
  }
}

/**
 * Pure helper exposed for tests. Computes the delay schedule used by
 * `scheduleReconnect`.
 */
export function computeBackoffMs(attempt: number, initialMs = 500, maxMs = 30_000): number {
  return Math.min(maxMs, initialMs * 2 ** attempt);
}
