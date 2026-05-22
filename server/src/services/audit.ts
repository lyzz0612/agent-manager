import type { AuditLogRepository } from "../db/repositories/audit.js";

/**
 * AuditService 是 AuditLogRepository 的薄包装，方便在业务调用处统一写入。
 *
 * v1 至少覆盖：Runner 注册、机器删除、机器改名、发起管理动作、动作终态、Runner 重连。
 */
export class AuditService {
  constructor(private readonly repo: AuditLogRepository) {}

  runnerRegistered(machineId: string, runnerId: string): void {
    this.repo.write({
      actor: "runner",
      event: "runner.registered",
      targetType: "machine",
      targetId: machineId,
      details: { runnerId },
    });
  }

  runnerConnected(machineId: string, runnerId: string): void {
    this.repo.write({
      actor: "runner",
      event: "runner.connected",
      targetType: "machine",
      targetId: machineId,
      details: { runnerId },
    });
  }

  runnerRejectedDeleted(machineId: string): void {
    this.repo.write({
      actor: "runner",
      event: "runner.rejected",
      targetType: "machine",
      targetId: machineId,
      details: { reason: "machine_deleted" },
    });
  }

  machineDeleted(machineId: string, actor: string): void {
    this.repo.write({
      actor,
      event: "machine.deleted",
      targetType: "machine",
      targetId: machineId,
    });
  }

  machineRenamed(machineId: string, actor: string, displayName: string): void {
    this.repo.write({
      actor,
      event: "machine.renamed",
      targetType: "machine",
      targetId: machineId,
      details: { displayName },
    });
  }

  actionCreated(actionId: string, machineId: string, agentKind: string, type: string, actor: string): void {
    this.repo.write({
      actor,
      event: "action.created",
      targetType: "action",
      targetId: actionId,
      details: { machineId, agentKind, type },
    });
  }

  actionFinished(actionId: string, status: string, summary: string | null): void {
    this.repo.write({
      actor: "runner",
      event: "action.finished",
      targetType: "action",
      targetId: actionId,
      details: { status, summary },
    });
  }

  list = (limit?: number) => this.repo.list(limit);
}
