import type {
  ActionKind,
  ActionStatus,
  AgentInstallStatus,
  MachineStatus,
  PlatformOs,
} from '../api/types';

export function formatMachineStatus(status: MachineStatus): string {
  switch (status) {
    case 'online':
      return '在线';
    case 'offline':
      return '离线';
    default:
      return status;
  }
}

export function formatPlatform(os: PlatformOs, arch: string): string {
  const osLabel = (() => {
    switch (os) {
      case 'linux':
        return 'Linux';
      case 'darwin':
        return 'macOS';
      case 'windows':
        return 'Windows';
      default:
        return '未知系统';
    }
  })();
  return arch ? `${osLabel} · ${arch}` : osLabel;
}

export function formatAgentStatus(status: AgentInstallStatus): string {
  switch (status) {
    case 'installed':
      return '已安装';
    case 'not_installed':
      return '未安装';
    case 'broken':
      return '异常';
    case 'unknown':
    default:
      return '未知';
  }
}

export function formatActionStatus(status: ActionStatus): string {
  switch (status) {
    case 'queued':
      return '排队中';
    case 'running':
      return '运行中';
    case 'succeeded':
      return '成功';
    case 'failed':
      return '失败';
    case 'cancelled':
      return '已取消';
    default:
      return status;
  }
}

export function formatActionKind(kind: ActionKind): string {
  switch (kind) {
    case 'detect':
      return '检测';
    case 'install':
      return '安装';
    case 'upgrade':
      return '升级';
    case 'doctor':
      return '体检';
    case 'uninstall':
      return '卸载';
    default:
      return kind;
  }
}

export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}
