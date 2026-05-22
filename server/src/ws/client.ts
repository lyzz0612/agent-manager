import type { WebSocket } from "ws";

import type { Logger } from "../logger.js";
import type { RealtimeEventBus } from "../realtime/events.js";
import type { ClientEvent } from "../protocol/client.js";

/**
 * Client WebSocket Hub：
 * - 已通过 HTTP 握手 Token 校验。
 * - 订阅 RealtimeEventBus，向所有连接的 Client 广播事件。
 *
 * v1 不做按机器订阅过滤，Client 自行根据 machineId 路由到对应视图。
 */
export class ClientWebSocketHub {
  private readonly sockets = new Set<WebSocket>();
  private detach: (() => void) | null = null;

  constructor(
    private readonly events: RealtimeEventBus,
    private readonly logger: Logger,
  ) {}

  start(): void {
    if (this.detach) return;
    this.detach = this.events.on((event) => this.broadcast(event));
  }

  stop(): void {
    this.detach?.();
    this.detach = null;
    for (const socket of this.sockets) {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
    }
    this.sockets.clear();
  }

  attach(socket: WebSocket): void {
    this.sockets.add(socket);
    this.logger.debug("client ws attached", { total: this.sockets.size });
    try {
      socket.send(JSON.stringify({ type: "hello", protocol: "client/v1" }));
    } catch {
      /* ignore */
    }
    socket.on("close", () => {
      this.sockets.delete(socket);
      this.logger.debug("client ws detached", { total: this.sockets.size });
    });
    socket.on("error", () => {
      this.sockets.delete(socket);
    });
    socket.on("message", () => {
      /* v1 不接收 Client 主动消息（除了 pong），忽略。 */
    });
  }

  broadcast(event: ClientEvent): void {
    if (this.sockets.size === 0) return;
    const payload = JSON.stringify(event);
    for (const socket of this.sockets) {
      if (socket.readyState === socket.OPEN) {
        try {
          socket.send(payload);
        } catch (err) {
          this.logger.warn("send client event failed", {
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  /** 仅供测试访问当前连接数。 */
  get size(): number {
    return this.sockets.size;
  }
}
