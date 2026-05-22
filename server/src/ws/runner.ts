import type { WebSocket } from "ws";

import type { Logger } from "../logger.js";
import type { MachineService } from "../services/machines.js";
import type { AgentStateService } from "../services/agents.js";
import type { ActionService } from "../services/actions.js";
import { ApiError } from "../errors.js";
import {
  type RunnerInboundMessage,
  type ServerOutboundMessage,
  RUNNER_PROTOCOL_VERSION,
} from "../protocol/runner.js";
import type { ManagementActionRow } from "../domain/types.js";

interface RunnerConnection {
  socket: WebSocket;
  machineId: string;
  runnerId: string;
}

/**
 * Runner Channel Hub：
 * - 接收 Runner 上行消息：heartbeat / detect / doctor / action 结果。
 * - 下行命令：派发管理动作。
 * - 维护 machineId -> connection 的映射，断开时把机器置 offline 并通知 Client。
 */
export class RunnerChannelHub {
  private readonly byMachine = new Map<string, RunnerConnection>();

  constructor(
    private readonly machines: MachineService,
    private readonly agents: AgentStateService,
    private readonly actions: ActionService,
    private readonly logger: Logger,
  ) {}

  /** 注入 ActionDispatcher 接口实现。 */
  asDispatcher() {
    return {
      dispatch: (action: ManagementActionRow): boolean => this.dispatch(action),
    };
  }

  attach(socket: WebSocket, runnerToken: string): void {
    let resolved: { machineId: string; runnerId: string };
    try {
      const result = this.machines.resolveRunnerCredentials(runnerToken);
      resolved = { machineId: result.machine.id, runnerId: result.runner.id };
    } catch (err) {
      const code =
        err instanceof ApiError
          ? err.message.includes("已被删除")
            ? "machine_deleted"
            : "unauthorized"
          : "unauthorized";
      this.sendRaw(socket, {
        v: RUNNER_PROTOCOL_VERSION,
        type: "server.error",
        code: code as "machine_deleted" | "unauthorized",
        message: err instanceof Error ? err.message : "鉴权失败",
      });
      try {
        socket.close(4401, "unauthorized");
      } catch {
        /* ignore */
      }
      return;
    }

    // 同一机器有旧连接时，强制下线旧连接。
    const previous = this.byMachine.get(resolved.machineId);
    if (previous && previous.socket !== socket) {
      try {
        this.sendRaw(previous.socket, {
          v: RUNNER_PROTOCOL_VERSION,
          type: "server.error",
          code: "unauthorized",
          message: "Runner 已在别处重新连接",
        });
        previous.socket.close(4002, "superseded");
      } catch {
        /* ignore */
      }
    }

    const connection: RunnerConnection = { socket, ...resolved };
    this.byMachine.set(resolved.machineId, connection);
    this.machines.onRunnerConnected(resolved.machineId, resolved.runnerId);

    this.sendRaw(socket, {
      v: RUNNER_PROTOCOL_VERSION,
      type: "server.welcome",
      machineId: resolved.machineId,
      serverTime: Date.now(),
    });

    // Runner 重连后，把 server 侧还在 running 的动作重新派发。
    this.actions.redispatchInflight(resolved.machineId);

    socket.on("message", (data) => {
      this.handleInbound(connection, data.toString("utf-8"));
    });
    socket.on("close", () => this.handleClose(connection));
    socket.on("error", (err) => {
      this.logger.warn("runner ws error", {
        machineId: connection.machineId,
        message: err.message,
      });
    });
  }

  private handleClose(connection: RunnerConnection): void {
    const current = this.byMachine.get(connection.machineId);
    // 只有当当前映射的就是这个连接时才置 offline。
    if (current && current.socket === connection.socket) {
      this.byMachine.delete(connection.machineId);
      this.machines.onRunnerDisconnected(connection.machineId, "offline");
    }
  }

  private handleInbound(connection: RunnerConnection, raw: string): void {
    let msg: RunnerInboundMessage;
    try {
      msg = JSON.parse(raw) as RunnerInboundMessage;
    } catch {
      this.sendRaw(connection.socket, {
        v: RUNNER_PROTOCOL_VERSION,
        type: "server.error",
        code: "bad_message",
        message: "消息不是合法 JSON",
      });
      return;
    }
    if (!msg || typeof msg !== "object" || !("type" in msg)) {
      this.sendRaw(connection.socket, {
        v: RUNNER_PROTOCOL_VERSION,
        type: "server.error",
        code: "bad_message",
        message: "消息缺少 type",
      });
      return;
    }

    try {
      switch (msg.type) {
        case "runner.hello":
          // welcome 已经在 attach 时下发；这里仅用于 Runner 重协商。
          return;
        case "runner.heartbeat":
          // 仅刷新最后在线时间（机器在线状态不变）。
          this.machines.onRunnerConnected(connection.machineId, connection.runnerId);
          return;
        case "runner.report.detect":
          for (const report of msg.reports) {
            this.agents.applyDetect(connection.machineId, report);
          }
          return;
        case "runner.report.doctor":
          this.agents.applyDoctor(connection.machineId, msg.report);
          return;
        case "runner.report.action_result": {
          this.actions.complete(msg.actionId, {
            status: msg.status,
            summary: msg.summary,
            result: msg.result ?? null,
            error: msg.error ?? null,
            logs: msg.logs,
          });
          if (msg.detect) {
            this.agents.applyDetect(connection.machineId, msg.detect);
          }
          return;
        }
        default: {
          const unknown: never = msg;
          void unknown;
          this.sendRaw(connection.socket, {
            v: RUNNER_PROTOCOL_VERSION,
            type: "server.error",
            code: "bad_message",
            message: "未知消息类型",
          });
        }
      }
    } catch (err) {
      this.logger.error("handle runner message failed", {
        machineId: connection.machineId,
        message: err instanceof Error ? err.message : String(err),
      });
      this.sendRaw(connection.socket, {
        v: RUNNER_PROTOCOL_VERSION,
        type: "server.error",
        code: "internal",
        message: "服务器处理失败",
      });
    }
  }

  /** 把动作下发给对应机器的 Runner。无 Runner 在线时返回 false。 */
  dispatch(action: ManagementActionRow): boolean {
    const connection = this.byMachine.get(action.machineId);
    if (!connection) return false;
    if (connection.socket.readyState !== connection.socket.OPEN) return false;

    this.sendRaw(connection.socket, {
      v: RUNNER_PROTOCOL_VERSION,
      type: "server.command.action",
      actionId: action.id,
      agentKind: action.agentKind,
      actionType: action.type,
      payload: action.payloadJson ? (JSON.parse(action.payloadJson) as Record<string, unknown>) : null,
    });
    return true;
  }

  /** 仅供测试：当前在线机器数。 */
  get onlineMachineCount(): number {
    return this.byMachine.size;
  }

  private sendRaw(socket: WebSocket, msg: ServerOutboundMessage | Record<string, unknown>): void {
    if (socket.readyState !== socket.OPEN) return;
    try {
      socket.send(JSON.stringify(msg));
    } catch (err) {
      this.logger.warn("send runner message failed", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
