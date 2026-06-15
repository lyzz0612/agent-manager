export type AppStatus = {
  app_name: string;
  version: string;
  mode: string;
};

export type SessionStatus = {
  authenticated: boolean;
};

export type OverviewAgentItem = {
  id: string;
  name: string;
  installed: boolean;
  version: string | null;
};

export type OverviewPluginItem = {
  id: string;
  name: string;
  installed: boolean;
};

export type OverviewData = {
  app_name: string;
  version: string;
  mode: string;
  agents: OverviewAgentItem[];
  plugins: OverviewPluginItem[];
};

export type RuntimeActionResult = {
  installed: boolean;
  version: string | null;
  install_dir: string;
  data_dir: string;
  message: string;
};

export type CursorAccountStatus = {
  logged_in: boolean;
  email: string | null;
  display_name: string | null;
  note: string;
};

export type AuthStep = {
  title: string;
  detail: string;
};

export type CursorAuthFlowStatus = {
  summary: string;
  steps: AuthStep[];
};

export type CursorLoginStartResult = {
  started: boolean;
  already_logged_in: boolean;
  auth_url: string | null;
  message: string;
};

export type CursorLoginSessionStatus = {
  active: boolean;
  auth_url: string | null;
  message: string;
  error: string | null;
};

export type KnownConfig = {
  disable_telemetry: boolean;
  auto_update: boolean;
  release_track: string;
};

export type RawConfigDocument = {
  path: string;
  content: string;
};

export type RawConfigPreview = {
  path: string;
  current_content: string;
  next_content: string;
};

export type AgentSummary = {
  id: string;
  name: string;
  installed: boolean;
  version: string | null;
  install_dir: string;
  data_dir: string;
  install_supported: boolean;
  install_command: string | null;
};

export type PluginSummary = {
  id: string;
  name: string;
  installed: boolean;
  version: string | null;
  install_dir: string;
  data_dir: string;
  install_supported: boolean;
  install_command: string | null;
  official_url: string;
  default_workspace: string;
};

export type PluginDetail = {
  id: string;
  name: string;
  installed: boolean;
  daemon_status: string;
  providers_listing: string;
  agents_listing: string;
  daemon_pair_json: string;
};

export type SkillSummary = {
  id: string;
  name: string;
  agent: string;
  path: string;
};

export type SkillFileSummary = {
  id: string;
  name: string;
  agent: string;
  folder: string;
  path: string;
};

export type SkillDocument = {
  id: string;
  name: string;
  agent: string;
  path: string;
  content: string;
};

export type MessageKind = "info" | "success" | "error";

export type AppSettings = {
  app_name: string;
  version: string;
  mode: string;
  repo_root: string;
  update_supported: boolean;
  git_remote: string | null;
  git_branch: string | null;
  git_commit: string | null;
  git_upstream_commit: string | null;
  update_available: boolean;
  behind_commits: number;
};

export type AppUpdateResult = {
  success: boolean;
  message: string;
  output: string;
  version: string;
  git_commit: string | null;
  restart_required: boolean;
  started?: boolean;
};

export type AppUpdateStatus = {
  active: boolean;
  phase: string;
  message: string;
  output: string;
  version: string;
  git_commit: string | null;
};

export const defaultKnownConfig: KnownConfig = {
  disable_telemetry: false,
  auto_update: true,
  release_track: "stable",
};
