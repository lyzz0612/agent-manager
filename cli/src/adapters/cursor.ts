// Cursor adapter.
//
// Documentation references (recorded so the runner never invents commands):
//   Install:   https://docs.cursor.com/get-started/installation
//   Update:    https://docs.cursor.com/get-started/installation#updating-cursor
//   Uninstall: https://docs.cursor.com/get-started/installation#uninstalling-cursor
//   CLI:       https://docs.cursor.com/cli/overview
//
// Cursor is primarily a GUI app distributed as a platform-specific installer.
// v1 limits itself to safe operations that match the official docs:
//   - detect: locate the `cursor` CLI shim and probe `cursor --version`.
//   - install/upgrade: drive the official `cursor-agent` updater when present;
//     otherwise return `unsupported` so the platform-specific download flow
//     remains a manual user step (avoids fabricating commands).
//   - uninstall: only the documented `cursor-agent uninstall` flow, otherwise
//     unsupported.

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type {
  AgentDetectReport,
  DoctorResult,
} from '../protocol/types.ts';
import { which } from '../utils/which.ts';
import { probeVersion, runCommand } from '../utils/exec.ts';
import type {
  AdapterContext,
  AdapterDocs,
  AgentAdapter,
  MutationResult,
} from './types.ts';

const DOCS: AdapterDocs = {
  install: {
    title: 'Cursor - Installation',
    url: 'https://docs.cursor.com/get-started/installation',
  },
  upgrade: {
    title: 'Cursor - Updating Cursor',
    url: 'https://docs.cursor.com/get-started/installation#updating-cursor',
  },
  uninstall: {
    title: 'Cursor - Uninstalling Cursor',
    url: 'https://docs.cursor.com/get-started/installation#uninstalling-cursor',
  },
};

export class CursorAdapter implements AgentAdapter {
  readonly agentType = 'cursor' as const;
  readonly displayName = 'Cursor';
  readonly docs = DOCS;

  async detect(ctx: AdapterContext): Promise<AgentDetectReport> {
    const exe = which('cursor', { platform: ctx.platform });
    const agentExe = which('cursor-agent', { platform: ctx.platform });
    const onPath = Boolean(exe || agentExe);
    let version: string | undefined;
    if (exe) {
      const probed = await probeVersion(exe, ['--version'], {
        signal: ctx.signal,
      });
      version = probed?.version ?? probed?.raw;
    }

    const configFiles = listCursorConfigFiles(ctx.platform);
    const authState = inferAuthState(configFiles);

    const report: AgentDetectReport = {
      agentType: 'cursor',
      status: onPath ? 'installed' : 'not_installed',
      onPath,
      configFiles,
      auth: authState,
      notes: [],
      ...(exe ? { executablePath: exe } : {}),
      ...(version ? { version } : {}),
    };
    if (onPath && !version) {
      report.status = 'misconfigured';
      report.notes?.push('cursor CLI found but --version produced no output');
    }
    return report;
  }

  async install(ctx: AdapterContext): Promise<MutationResult> {
    // Avoid inventing distro-specific download steps. The only universally
    // documented self-update entrypoint is `cursor-agent update`, which the
    // user has to install once via the official installer.
    return platformUnsupported(
      ctx,
      'Install Cursor from the official installer at https://www.cursor.com/downloads. Runner v1 only manages updates and uninstall via cursor-agent.',
    );
  }

  async upgrade(ctx: AdapterContext): Promise<MutationResult> {
    const exe = which('cursor-agent', { platform: ctx.platform });
    if (!exe) {
      return {
        ok: false,
        summary:
          'cursor-agent CLI not found on PATH; install Cursor first per docs.cursor.com.',
      };
    }
    ctx.log(`running ${exe} update (docs: ${DOCS.upgrade.url})`);
    const result = await runCommand(exe, ['update'], {
      signal: ctx.signal,
      allowNonZeroExit: true,
    });
    appendCommandLog(ctx, result);
    if (result.exitCode === 0) {
      return { ok: true, summary: 'Cursor updated via cursor-agent update.' };
    }
    return {
      ok: false,
      summary: `cursor-agent update failed (exit ${result.exitCode ?? 'null'})`,
    };
  }

  async uninstall(ctx: AdapterContext): Promise<MutationResult> {
    const exe = which('cursor-agent', { platform: ctx.platform });
    if (!exe) {
      return platformUnsupported(
        ctx,
        'Uninstall Cursor via the platform-specific instructions documented at docs.cursor.com.',
      );
    }
    ctx.log(`running ${exe} uninstall (docs: ${DOCS.uninstall.url})`);
    const result = await runCommand(exe, ['uninstall'], {
      signal: ctx.signal,
      allowNonZeroExit: true,
    });
    appendCommandLog(ctx, result);
    if (result.exitCode === 0) {
      return {
        ok: true,
        summary: 'Cursor uninstalled via cursor-agent uninstall.',
      };
    }
    return {
      ok: false,
      summary: `cursor-agent uninstall failed (exit ${result.exitCode ?? 'null'})`,
    };
  }

  async doctor(ctx: AdapterContext): Promise<DoctorResult> {
    const report = await this.detect(ctx);
    return {
      overall: report.status === 'installed' ? 'pass' : 'warn',
      checks: [
        {
          name: 'cursor-on-path',
          outcome: report.onPath ? 'pass' : 'warn',
          message: report.onPath
            ? `cursor CLI located at ${report.executablePath ?? 'unknown path'}`
            : 'cursor CLI not found on PATH',
        },
        {
          name: 'cursor-version',
          outcome: report.version ? 'pass' : 'warn',
          message: report.version
            ? `version ${report.version}`
            : 'unable to read cursor version',
        },
        {
          name: 'cursor-config',
          outcome: report.configFiles.some((c) => c.exists) ? 'pass' : 'warn',
          message: report.configFiles.some((c) => c.exists)
            ? 'cursor config directory present'
            : 'cursor config directory not found',
        },
      ],
    };
  }
}

function listCursorConfigFiles(platform: NodeJS.Platform) {
  const home = homedir();
  const candidates: string[] = [];
  switch (platform) {
    case 'darwin':
      candidates.push(join(home, 'Library/Application Support/Cursor'));
      break;
    case 'win32':
      if (process.env.APPDATA) {
        candidates.push(join(process.env.APPDATA, 'Cursor'));
      }
      break;
    default:
      candidates.push(join(home, '.config/Cursor'));
      break;
  }
  return candidates.map((path) => ({ path, exists: existsSync(path) }));
}

function inferAuthState(
  configFiles: { path: string; exists: boolean }[],
): AgentDetectReport['auth'] {
  if (configFiles.some((c) => c.exists)) {
    return { kind: 'present', redactedHint: 'cursor config dir detected' };
  }
  return { kind: 'unknown' };
}

function platformUnsupported(
  ctx: AdapterContext,
  message: string,
): MutationResult {
  ctx.log(`platform ${ctx.platform}/${ctx.arch}: ${message}`);
  return { ok: false, unsupported: true, summary: message };
}

function appendCommandLog(
  ctx: AdapterContext,
  result: { stdout: string; stderr: string },
): void {
  const lines = [result.stdout, result.stderr]
    .join('\n')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-20);
  for (const line of lines) ctx.log(line);
}
