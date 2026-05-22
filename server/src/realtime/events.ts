import { EventEmitter } from "node:events";

import type { ClientEvent } from "../protocol/client.js";

/**
 * Server 内部事件总线：
 * - HTTP / Runner Channel 处理逻辑触发 emit。
 * - Client WebSocket Hub 订阅并转发。
 *
 * 抽象成单一通道，可以让其他模块按需做派生订阅，避免环形依赖。
 */
export class RealtimeEventBus {
  private readonly emitter = new EventEmitter();

  emit(event: ClientEvent): void {
    this.emitter.emit("event", event);
  }

  on(handler: (event: ClientEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => {
      this.emitter.off("event", handler);
    };
  }
}
