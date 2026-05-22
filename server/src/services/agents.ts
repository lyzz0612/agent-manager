import { AGENT_KINDS } from "../domain/types.js";
import type {
  AgentInstallationRow,
  AgentKind,
} from "../domain/types.js";
import {
  AgentInstallationRepository,
  DoctorCheckRepository,
} from "../db/repositories/agents.js";
import { agentInstallationToDTO } from "../dto.js";
import type { AgentDetectReport, DoctorReport } from "../protocol/runner.js";
import type { AgentInstallationDTO } from "../protocol/client.js";
import type { RealtimeEventBus } from "../realtime/events.js";

export class AgentStateService {
  constructor(
    private readonly agents: AgentInstallationRepository,
    private readonly doctor: DoctorCheckRepository,
    private readonly events: RealtimeEventBus,
  ) {}

  applyDetect(machineId: string, report: AgentDetectReport): AgentInstallationRow {
    const row = this.agents.upsertDetection({
      machineId,
      agentKind: report.agentKind,
      status: report.status,
      version: report.version,
      execPath: report.execPath,
      onPath: report.onPath,
      configSummary: report.configSummary,
    });

    const latestDoctor = this.doctor.getLatest(machineId, report.agentKind);
    const dto = agentInstallationToDTO(row, latestDoctor);
    this.events.emit({
      type: "agent.status",
      machineId,
      agentKind: row.agentKind,
      agent: dto,
    });

    return row;
  }

  applyDoctor(machineId: string, report: DoctorReport): void {
    this.doctor.insert({
      machineId,
      agentKind: report.agentKind,
      status: report.status,
      summary: report.summary,
      details: report.details ?? null,
    });

    const installation = this.agents.getByMachineAndKind(
      machineId,
      report.agentKind,
    );
    if (installation) {
      const latestDoctor = this.doctor.getLatest(machineId, report.agentKind);
      const dto = agentInstallationToDTO(installation, latestDoctor);
      this.events.emit({
        type: "agent.status",
        machineId,
        agentKind: report.agentKind,
        agent: dto,
      });
    }
  }

  /**
   * 返回机器的全部 Agent 状态。
   * 即使 Agent 还没有任何记录，也按内置 AGENT_KINDS 返回 unknown 占位，
   * 这样 Client 可以一次性渲染所有 Agent 入口。
   */
  listForMachine(machineId: string): AgentInstallationDTO[] {
    const installations = new Map(
      this.agents.listByMachine(machineId).map((row) => [row.agentKind, row]),
    );
    const result: AgentInstallationDTO[] = [];
    for (const kind of AGENT_KINDS) {
      const row = installations.get(kind);
      const doctor = this.doctor.getLatest(machineId, kind);
      if (row) {
        result.push(agentInstallationToDTO(row, doctor));
      } else {
        result.push({
          agentKind: kind,
          status: "unknown",
          version: null,
          execPath: null,
          onPath: null,
          configSummary: null,
          lastDetectedAt: null,
          doctor: doctor
            ? {
                status: doctor.status,
                summary: doctor.summary,
                createdAt: new Date(doctor.createdAt).toISOString(),
              }
            : null,
        });
      }
    }
    return result;
  }

  getForMachine(machineId: string, kind: AgentKind): AgentInstallationDTO {
    return this.listForMachine(machineId).find((a) => a.agentKind === kind)!;
  }
}
