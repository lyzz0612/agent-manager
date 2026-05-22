/**
 * Row -> DTO 映射工具。集中放在一起方便和 protocol/client.ts 对齐。
 */

import type {
  AgentInstallationRow,
  DoctorCheckRow,
  MachineRow,
  ManagementActionRow,
} from "./domain/types.js";
import type {
  AgentInstallationDTO,
  DoctorSummaryDTO,
  MachineDTO,
  ManagementActionDTO,
} from "./protocol/client.js";

function toIso(ts: number | null | undefined): string | null {
  if (ts == null) return null;
  return new Date(ts).toISOString();
}

export function machineRowToDTO(row: MachineRow): MachineDTO {
  return {
    id: row.id,
    displayName: row.displayName,
    hostname: row.hostname,
    platform: row.platform,
    arch: row.arch,
    status: row.status,
    lastSeenAt: toIso(row.lastSeenAt),
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
  };
}

export function agentInstallationToDTO(
  row: AgentInstallationRow,
  doctor: DoctorCheckRow | null,
): AgentInstallationDTO {
  const doctorDTO: DoctorSummaryDTO | null = doctor
    ? {
        status: doctor.status,
        summary: doctor.summary,
        createdAt: toIso(doctor.createdAt)!,
      }
    : null;
  return {
    agentKind: row.agentKind,
    status: row.status,
    version: row.version,
    execPath: row.execPath,
    onPath: row.onPath === null ? null : row.onPath === 1,
    configSummary: row.configSummary,
    lastDetectedAt: toIso(row.lastDetectedAt),
    doctor: doctorDTO,
  };
}

export function actionRowToDTO(row: ManagementActionRow): ManagementActionDTO {
  return {
    id: row.id,
    machineId: row.machineId,
    agentKind: row.agentKind,
    type: row.type,
    status: row.status,
    resultSummary: row.resultSummary,
    errorMessage: row.errorMessage,
    createdAt: toIso(row.createdAt)!,
    startedAt: toIso(row.startedAt),
    finishedAt: toIso(row.finishedAt),
  };
}
