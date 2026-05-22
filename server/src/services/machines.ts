import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { MachineRepository } from "../db/repositories/machines.js";
import type { RunnerRepository } from "../db/repositories/runners.js";
import { badRequest, notFound, unauthorized } from "../errors.js";
import { machineRowToDTO } from "../dto.js";
import type { RealtimeEventBus } from "../realtime/events.js";
import type { AuditService } from "./audit.js";
import type {
  MachineRow,
  MachineStatus,
  RunnerRow,
} from "../domain/types.js";

export interface RegisterRunnerInput {
  /** Runner 报上来的物理机标识。 */
  hostname: string | null;
  platform: string | null;
  arch: string | null;
  /** Runner 自定义 / 用户自定义的显示名。可选。 */
  displayName?: string | null;
  runnerVersion?: string | null;
}

export interface RegisterRunnerResult {
  machine: MachineRow;
  runner: RunnerRow;
  /** 明文 Runner 凭据：只在注册时下发，Server 数据库里只存 hash。 */
  runnerToken: string;
}

export interface RunnerCredentials {
  machineId: string;
  runnerId: string;
}

export class MachineService {
  constructor(
    private readonly machines: MachineRepository,
    private readonly runners: RunnerRepository,
    private readonly audit: AuditService,
    private readonly events: RealtimeEventBus,
  ) {}

  /** Runner login：根据 fingerprint 复用未删除机器，或创建新机器。 */
  registerRunner(input: RegisterRunnerInput): RegisterRunnerResult {
    const existing = this.machines.findActiveByFingerprint(
      input.hostname,
      input.platform,
      input.arch,
    );

    let machine: MachineRow;
    if (existing) {
      this.runners.revokeByMachine(existing.id);
      machine = existing;
    } else {
      const id = randomUUID();
      const displayName =
        input.displayName?.trim() ||
        input.hostname?.trim() ||
        `machine-${id.slice(0, 8)}`;
      machine = this.machines.insert({
        id,
        displayName,
        hostname: input.hostname,
        platform: input.platform,
        arch: input.arch,
      });
    }

    const runnerToken = generateToken();
    const runnerId = randomUUID();
    const runner = this.runners.insert({
      id: runnerId,
      machineId: machine.id,
      tokenHash: hashToken(runnerToken),
      version: input.runnerVersion ?? null,
    });

    this.audit.runnerRegistered(machine.id, runner.id);

    return { machine, runner, runnerToken };
  }

  /** Runner 使用凭据连接时，解析出对应 runner & 校验机器未删除。 */
  resolveRunnerCredentials(runnerToken: string): {
    machine: MachineRow;
    runner: RunnerRow;
  } {
    const tokenHash = hashToken(runnerToken);
    const runner = this.runners.findByTokenHash(tokenHash);
    if (!runner || runner.revokedAt !== null) {
      throw unauthorized("Runner 凭据无效或已撤销");
    }
    // 即使已软删的机器记录也能取出来，关键是要校验。
    const machine = this.machines.getById(runner.machineId);
    if (!machine) throw unauthorized("Runner 关联的机器不存在");
    if (machine.deletedAt !== null) {
      this.audit.runnerRejectedDeleted(machine.id);
      throw unauthorized("机器已被删除，请重新执行 login");
    }
    return { machine, runner };
  }

  onRunnerConnected(machineId: string, runnerId: string): MachineRow | null {
    this.runners.markConnected(runnerId);
    const updated = this.machines.setStatus(machineId, "online", Date.now());
    if (updated) {
      this.audit.runnerConnected(machineId, runnerId);
      this.events.emit({
        type: "machine.status",
        machineId: updated.id,
        status: updated.status,
        lastSeenAt: updated.lastSeenAt
          ? new Date(updated.lastSeenAt).toISOString()
          : null,
      });
    }
    return updated;
  }

  onRunnerDisconnected(
    machineId: string,
    status: Extract<MachineStatus, "offline" | "error"> = "offline",
  ): MachineRow | null {
    const updated = this.machines.setStatus(machineId, status, Date.now());
    if (updated) {
      this.events.emit({
        type: "machine.status",
        machineId: updated.id,
        status: updated.status,
        lastSeenAt: updated.lastSeenAt
          ? new Date(updated.lastSeenAt).toISOString()
          : null,
      });
    }
    return updated;
  }

  listVisible(): MachineRow[] {
    return this.machines.listActive();
  }

  getVisible(id: string): MachineRow {
    const row = this.machines.getActiveById(id);
    if (!row) throw notFound("机器不存在");
    return row;
  }

  rename(id: string, displayName: string, actor: string): MachineRow {
    const name = displayName.trim();
    if (!name) throw badRequest("displayName 不能为空");
    if (name.length > 80) throw badRequest("displayName 不能超过 80 个字符");
    const updated = this.machines.updateDisplayName(id, name);
    if (!updated) throw notFound("机器不存在或已删除");
    this.audit.machineRenamed(id, actor, name);
    this.events.emit({
      type: "machine.status",
      machineId: updated.id,
      status: updated.status,
      lastSeenAt: updated.lastSeenAt
        ? new Date(updated.lastSeenAt).toISOString()
        : null,
    });
    return updated;
  }

  softDelete(id: string, actor: string): void {
    const ok = this.machines.softDelete(id);
    if (!ok) throw notFound("机器不存在或已删除");
    this.runners.revokeByMachine(id);
    this.audit.machineDeleted(id, actor);
    this.events.emit({
      type: "machine.status",
      machineId: id,
      status: "offline",
      lastSeenAt: null,
    });
  }

  toDTO = machineRowToDTO;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}
