import type {
  ActionLogRepository,
  ManagementActionRepository,
} from "../db/repositories/actions.js";
import { actionRowToDTO } from "../dto.js";
import type { RealtimeEventBus } from "../realtime/events.js";
import { conflict, notFound } from "../errors.js";
import type { Logger } from "../logger.js";
import type { AuditService } from "./audit.js";
import type {
  ActionStatus,
  ActionType,
  AgentKind,
  ManagementActionRow,
} from "../domain/types.js";
import type { MachineRepository } from "../db/repositories/machines.js";

/**
 * Runner 派发器接口。
 *
 * 真实实现是 Runner WebSocket Hub；测试可以注入内存 stub。
 * 返回值为 `true` 表示已成功递交给某个在线 Runner，`false` 表示当前机器没有在线 Runner。
 */
export interface ActionDispatcher {
  dispatch(action: ManagementActionRow): boolean;
}

export interface CreateActionInput {
  machineId: string;
  agentKind: AgentKind;
  type: ActionType;
  payload?: Record<string, unknown> | null;
  actor?: string | null;
}

export interface ActionTerminalInput {
  status: Extract<ActionStatus, "succeeded" | "failed" | "cancelled">;
  summary: string | null;
  result?: Record<string, unknown> | null;
  error?: string | null;
  logs?: Array<{ level: "info" | "warn" | "error"; message: string }>;
}

/**
 * 管理动作服务：负责动作生命周期 + 调度 + 实时事件广播 + 审计。
 *
 * 调度规则：
 * - 同机器同 Agent 串行：如果该 (machine, agent) 已经有 queued/running，则新动作入队为 queued。
 * - 同机器不同 Agent 并行：不同 Agent 之间互不阻塞。
 * - 当一个动作进入终态时，从同 (machine, agent) 的 queued 中挑选最早的一条置 running 并派发。
 */
export class ActionService {
  constructor(
    private readonly machines: MachineRepository,
    private readonly actions: ManagementActionRepository,
    private readonly logs: ActionLogRepository,
    private readonly audit: AuditService,
    private readonly events: RealtimeEventBus,
    private readonly logger: Logger,
  ) {}

  private dispatcher: ActionDispatcher | null = null;

  /** 在 HTTP / WS 模块装配完成后绑定。避免初始化时的循环依赖。 */
  setDispatcher(dispatcher: ActionDispatcher): void {
    this.dispatcher = dispatcher;
  }

  /** Client 请求创建一个新动作。 */
  create(input: CreateActionInput): ManagementActionRow {
    const machine = this.machines.getActiveById(input.machineId);
    if (!machine) {
      throw notFound("机器不存在或已删除");
    }

    const hasInflight = this.actions.hasInflightForAgent(
      input.machineId,
      input.agentKind,
    );

    const row = this.actions.insert({
      machineId: input.machineId,
      agentKind: input.agentKind,
      type: input.type,
      payload: input.payload ?? null,
      createdBy: input.actor ?? "client",
      status: "queued",
    });

    this.audit.actionCreated(
      row.id,
      row.machineId,
      row.agentKind,
      row.type,
      input.actor ?? "client",
    );
    this.events.emit({ type: "action.status", action: actionRowToDTO(row) });

    if (!hasInflight) {
      this.promoteToRunning(row.id);
    } else {
      this.logger.info("action queued (busy)", {
        actionId: row.id,
        machineId: row.machineId,
        agentKind: row.agentKind,
      });
    }
    return this.actions.getById(row.id)!;
  }

  /**
   * 把指定 queued 动作置为 running 并派发。如果机器当前没有 Runner 在线，
   * 动作维持 running 状态等待 Runner 重连后通过 dispatcher 重发，或者由调用方
   * 处理为失败（v1 默认维持 running，连接恢复后再次 dispatch）。
   */
  private promoteToRunning(actionId: string): void {
    const updated = this.actions.markRunning(actionId);
    if (!updated) return;
    this.events.emit({
      type: "action.status",
      action: actionRowToDTO(updated),
    });

    if (this.dispatcher) {
      const accepted = this.dispatcher.dispatch(updated);
      if (!accepted) {
        // 没有在线 Runner，标记失败并触发下一个 queued。
        this.fail(updated.id, {
          status: "failed",
          summary: "没有可用 Runner",
          error: "machine_not_online",
        });
      }
    } else {
      this.logger.warn("dispatcher not configured; action remains running", {
        actionId,
      });
    }
  }

  /** Runner 上报动作终态。 */
  complete(actionId: string, input: ActionTerminalInput): ManagementActionRow {
    const current = this.actions.getById(actionId);
    if (!current) throw notFound("动作不存在");
    if (current.status !== "queued" && current.status !== "running") {
      throw conflict(`动作处于终态 ${current.status}，无法再次更新`);
    }

    const updated = this.actions.markTerminal(
      actionId,
      input.status,
      input.summary,
      input.result ?? null,
      input.error ?? null,
    );
    if (!updated) throw notFound("更新动作失败");

    for (const log of input.logs ?? []) {
      this.logs.append(actionId, log.level, log.message);
    }

    this.audit.actionFinished(updated.id, updated.status, updated.resultSummary);
    this.events.emit({ type: "action.status", action: actionRowToDTO(updated) });

    this.scheduleNext(updated.machineId, updated.agentKind);
    return updated;
  }

  /** 内部专用：直接将动作标记失败并继续调度。 */
  private fail(actionId: string, input: ActionTerminalInput): void {
    const updated = this.actions.markTerminal(
      actionId,
      input.status,
      input.summary,
      input.result ?? null,
      input.error ?? null,
    );
    if (!updated) return;
    this.audit.actionFinished(updated.id, updated.status, updated.resultSummary);
    this.events.emit({ type: "action.status", action: actionRowToDTO(updated) });
    this.scheduleNext(updated.machineId, updated.agentKind);
  }

  /** 找出同 (machine, agent) 下一条 queued 并推进。 */
  private scheduleNext(machineId: string, agentKind: AgentKind): void {
    const next = this.actions.findNextQueuedForAgent(machineId, agentKind);
    if (!next) return;
    this.promoteToRunning(next.id);
  }

  /**
   * Runner 重连时：把该机器在 running 状态、且尚未真正派发的动作重新派发。
   *
   * 简化策略：v1 不区分“已派发但 Runner 未确认”和“仅 Server 标记 running”——
   * 重连即认为 Server 侧动作丢失了下行命令，需要重发；幂等性由动作 id 保证。
   */
  redispatchInflight(machineId: string): void {
    if (!this.dispatcher) return;
    const inflight = this.actions.listInflightForMachine(machineId);
    for (const action of inflight) {
      if (action.status === "running") {
        const accepted = this.dispatcher.dispatch(action);
        if (!accepted) {
          this.logger.warn("redispatch failed, runner offline", {
            actionId: action.id,
            machineId,
          });
        }
      }
    }
    // 同时尝试推进每个 agent 的下一个 queued。
    const visited = new Set<string>();
    for (const action of inflight) {
      const key = `${action.machineId}:${action.agentKind}`;
      if (visited.has(key)) continue;
      visited.add(key);
      if (action.status === "queued") {
        // 仅当没有 running 时才尝试推进。
        const stillBusy = this.actions
          .listInflightForMachine(machineId)
          .some(
            (r) =>
              r.agentKind === action.agentKind && r.status === "running",
          );
        if (!stillBusy) this.promoteToRunning(action.id);
      }
    }
  }

  /**
   * Runner 断开时：把该机器所有 running 动作回退为 queued。
   *
   * 这是“等待重连”策略；如果选择“立刻失败”，业务体验上会让短暂网络抖动也变失败。
   * v1 暂时保持 running，待真实超时机制接入后再细化。
   */
  // (no-op preserved for future use)

  getById(id: string): ManagementActionRow | null {
    return this.actions.getById(id);
  }

  listForMachine(machineId: string, limit = 50): ManagementActionRow[] {
    return this.actions.listForMachine(machineId, limit);
  }

  listLogs(actionId: string, limit = 200) {
    return this.logs.list(actionId, limit);
  }
}
