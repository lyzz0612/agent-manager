// AgentAdapter contract. Each adapter encapsulates everything Runner needs to
// know about a single agent: detect, install, upgrade, uninstall and a
// lightweight doctor pass.

import type {
  AgentDetectReport,
  AgentType,
  DoctorResult,
} from '../protocol/types.ts';

export interface AdapterContext {
  /** Aborts the action when the executor decides to time it out. */
  signal: AbortSignal;
  /** Appended to with progress / log lines. Adapters keep messages short. */
  log: (line: string) => void;
  /** Platform of the current host; adapters short-circuit on unsupported. */
  platform: NodeJS.Platform;
  arch: string;
}

/** Documentation references that must be cited for any mutation. */
export interface DocReference {
  title: string;
  url: string;
}

export interface AdapterDocs {
  install: DocReference;
  upgrade: DocReference;
  uninstall: DocReference;
}

export interface AgentAdapter {
  readonly agentType: AgentType;
  readonly displayName: string;
  readonly docs: AdapterDocs;

  detect(ctx: AdapterContext): Promise<AgentDetectReport>;

  install(ctx: AdapterContext): Promise<MutationResult>;
  upgrade(ctx: AdapterContext): Promise<MutationResult>;
  uninstall(ctx: AdapterContext): Promise<MutationResult>;

  doctor(ctx: AdapterContext): Promise<DoctorResult>;
}

export interface MutationResult {
  /** True when the underlying command succeeded according to the official docs. */
  ok: boolean;
  /** Short user-facing summary (single sentence). */
  summary: string;
  /** Whether the adapter explicitly refused because of unsupported platform. */
  unsupported?: boolean;
}
