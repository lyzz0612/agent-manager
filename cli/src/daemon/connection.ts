// Daemon connection. Wraps a Node.js built-in WebSocket (Node >=22) so the
// Runner can subscribe to server-issued actions, send heartbeats and reconnect
// with exponential backoff. Auth failures surfaced from the server bubble up
// so the daemon command can advise the user to re-`login`.

import type {
  RunnerHeartbeat,
  RunnerHello,
  RunnerOutbound,
  ServerActionRequest,
  ServerAuthFailure,
  ServerInbound,
} from '../protocol/types.ts';
import { PROTOCOL_VERSION } from '../protocol/types.ts';
import { logger } from '../utils/logger.ts';

export interface DaemonConnectionOptions {
  url: string;
  machineId: string;
  hostname: string;
  platform: NodeJS.Platform;
  arch: string;
  runnerVersion: string;
  heartbeatIntervalMs?: number;
  /** Backoff cap used between reconnect attempts. */
  reconnectMaxDelayMs?: number;
  /** Provide a WebSocket constructor for tests. */
  webSocketCtor?: typeof globalThis.WebSocket;
}

export type ConnectionEventMap = {
  open: { url: string };
  close: { code: number; reason: string };
  action: ServerActionRequest;
  authFailure: ServerAuthFailure;
  error: Error;
};

export type ConnectionListener<K extends keyof ConnectionEventMap> = (
  payload: ConnectionEventMap[K],
) => void;

interface ListenerEntry {
  event: string;
  fn: (...args: unknown[]) => void;
}

export class DaemonConnection {
  private readonly options: Required<DaemonConnectionOptions>;
  private readonly listeners: ListenerEntry[] = [];
  private stopped = false;
  private socket?: globalThis.WebSocket;
  private heartbeatTimer?: NodeJS.Timeout;
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectAttempts = 0;
  private staleCredentials = false;

  constructor(options: DaemonConnectionOptions) {
    const ctor =
      options.webSocketCtor ??
      (globalThis as { WebSocket?: typeof globalThis.WebSocket }).WebSocket;
    if (!ctor) {
      throw new Error(
        'Global WebSocket is not available. Upgrade to Node.js >=22 or pass webSocketCtor.',
      );
    }
    this.options = {
      heartbeatIntervalMs: 15_000,
      reconnectMaxDelayMs: 30_000,
      webSocketCtor: ctor,
      ...options,
    };
  }

  on<K extends keyof ConnectionEventMap>(
    event: K,
    listener: ConnectionListener<K>,
  ): void {
    this.listeners.push({ event, fn: listener as (...args: unknown[]) => void });
  }

  start(): void {
    if (this.stopped) return;
    this.openSocket();
  }

  stop(): void {
    this.stopped = true;
    this.clearHeartbeat();
    this.clearReconnect();
    if (this.socket) {
      try {
        this.socket.close(1000, 'runner-stop');
      } catch {
        /* noop */
      }
      this.socket = undefined;
    }
  }

  send(message: RunnerOutbound): boolean {
    const sock = this.socket;
    if (!sock || sock.readyState !== 1 /* OPEN */) return false;
    try {
      sock.send(JSON.stringify(message));
      return true;
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  }

  /** Useful in tests to verify the daemon noticed stale credentials. */
  hasStaleCredentials(): boolean {
    return this.staleCredentials;
  }

  private openSocket(): void {
    const ctor = this.options.webSocketCtor;
    let sock: globalThis.WebSocket;
    try {
      sock = new ctor(this.options.url);
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      this.scheduleReconnect();
      return;
    }
    this.socket = sock;

    sock.addEventListener('open', () => {
      this.reconnectAttempts = 0;
      this.emit('open', { url: this.options.url });
      const hello: RunnerHello = {
        type: 'runner.hello',
        protocolVersion: PROTOCOL_VERSION,
        machineId: this.options.machineId,
        hostname: this.options.hostname,
        platform: this.options.platform,
        arch: this.options.arch,
        runnerVersion: this.options.runnerVersion,
      };
      this.send(hello);
      this.startHeartbeat();
    });
    sock.addEventListener('message', (event: MessageEvent) => {
      this.handleMessage(event.data);
    });
    sock.addEventListener('close', (event: CloseEvent) => {
      this.clearHeartbeat();
      this.socket = undefined;
      this.emit('close', { code: event.code, reason: event.reason });
      if (!this.stopped && !this.staleCredentials) {
        this.scheduleReconnect();
      }
    });
    sock.addEventListener('error', (event: Event) => {
      const message =
        (event as { message?: string }).message ??
        'websocket error (no message)';
      this.emit('error', new Error(message));
    });
  }

  private handleMessage(data: unknown): void {
    let text: string;
    if (typeof data === 'string') text = data;
    else if (data instanceof Uint8Array) text = Buffer.from(data).toString('utf8');
    else if (data instanceof ArrayBuffer)
      text = Buffer.from(data).toString('utf8');
    else if (Buffer.isBuffer(data as Buffer)) text = (data as Buffer).toString('utf8');
    else return;

    let parsed: ServerInbound;
    try {
      parsed = JSON.parse(text) as ServerInbound;
    } catch {
      this.emit('error', new Error('Failed to parse server message'));
      return;
    }
    switch (parsed.type) {
      case 'server.action':
        this.emit('action', parsed);
        break;
      case 'server.auth_failure':
        this.staleCredentials = true;
        this.emit('authFailure', parsed);
        this.stop();
        logger.warn(
          `Server rejected runner credentials (${parsed.reason}): ${parsed.message}. Please re-run 'agentops-runner login'.`,
        );
        break;
      case 'server.ack':
        // ignored in v1
        break;
    }
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();
    const interval = this.options.heartbeatIntervalMs;
    this.heartbeatTimer = setInterval(() => {
      const beat: RunnerHeartbeat = {
        type: 'runner.heartbeat',
        machineId: this.options.machineId,
        sentAt: new Date().toISOString(),
      };
      this.send(beat);
    }, interval);
    this.heartbeatTimer.unref?.();
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.reconnectAttempts += 1;
    const base = 1_000 * Math.min(2 ** this.reconnectAttempts, 30);
    const jitter = Math.floor(Math.random() * 500);
    const delay = Math.min(base + jitter, this.options.reconnectMaxDelayMs);
    logger.info(
      `Daemon reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}).`,
    );
    this.reconnectTimer = setTimeout(() => {
      this.openSocket();
    }, delay);
    this.reconnectTimer.unref?.();
  }

  private emit<K extends keyof ConnectionEventMap>(
    event: K,
    payload: ConnectionEventMap[K],
  ): void {
    for (const entry of this.listeners) {
      if (entry.event === event) {
        try {
          entry.fn(payload);
        } catch (err) {
          logger.error('Listener threw', err);
        }
      }
    }
  }
}
