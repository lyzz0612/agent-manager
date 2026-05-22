// Claude Code adapter.
//
// Documentation references:
//   Install:   https://docs.claude.com/en/docs/claude-code/setup
//   Upgrade:   https://docs.claude.com/en/docs/claude-code/setup#updating-claude-code
//   Uninstall: https://docs.claude.com/en/docs/claude-code/setup#uninstall
//   Package:   https://www.npmjs.com/package/@anthropic-ai/claude-code
//
// Claude Code is distributed as the npm package `@anthropic-ai/claude-code`
// providing the `claude` CLI. Install/upgrade/uninstall follow the official
// npm-based instructions.

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

const PACKAGE_NAME = '@anthropic-ai/claude-code';
const CLI_COMMAND = 'claude';

const DOCS: AdapterDocs = {
  install: {
    title: 'Claude Code - Setup',
    url: 'https://docs.claude.com/en/docs/claude-code/setup',
  },
  upgrade: {
    title: 'Claude Code - Updating Claude Code',
    url: 'https://docs.claude.com/en/docs/claude-code/setup#updating-claude-code',
  },
  uninstall: {
    title: 'Claude Code - Uninstall',
    url: 'https://docs.claude.com/en/docs/claude-code/setup#uninstall',
  },
};

export class ClaudeCodeAdapter implements AgentAdapter {
  readonly agentType = 'claude-code' as const;
  readonly displayName = 'Claude Code';
  readonly docs = DOCS;

  async detect(ctx: AdapterContext): Promise<AgentDetectReport> {
    const exe = which(CLI_COMMAND, { platform: ctx.platform });
    const onPath = Boolean(exe);
    let version: string | undefined;
    if (exe) {
      const probed = await probeVersion(exe, ['--version'], {
        signal: ctx.signal,
      });
      version = probed?.version ?? probed?.raw;
    }
    const configFiles = listConfigFiles();
    const auth = inferAuth(configFiles);

    const report: AgentDetectReport = {
      agentType: 'claude-code',
      status: onPath ? 'installed' : 'not_installed',
      onPath,
      configFiles,
      auth,
      notes: [],
      ...(exe ? { executablePath: exe } : {}),
      ...(version ? { version } : {}),
    };
    if (onPath && !version) {
      report.status = 'misconfigured';
      report.notes?.push('claude on PATH but --version produced no output');
    }
    return report;
  }

  async install(ctx: AdapterContext): Promise<MutationResult> {
    return await npmGlobal(ctx, 'install', PACKAGE_NAME, DOCS.install);
  }

  async upgrade(ctx: AdapterContext): Promise<MutationResult> {
    return await npmGlobal(
      ctx,
      'install',
      `${PACKAGE_NAME}@latest`,
      DOCS.upgrade,
    );
  }

  async uninstall(ctx: AdapterContext): Promise<MutationResult> {
    return await npmGlobal(ctx, 'uninstall', PACKAGE_NAME, DOCS.uninstall);
  }

  async doctor(ctx: AdapterContext): Promise<DoctorResult> {
    const report = await this.detect(ctx);
    const npmAvailable = Boolean(which('npm', { platform: ctx.platform }));
    return {
      overall:
        report.status === 'installed'
          ? npmAvailable
            ? 'pass'
            : 'warn'
          : 'warn',
      checks: [
        {
          name: 'claude-on-path',
          outcome: report.onPath ? 'pass' : 'warn',
          message: report.onPath
            ? `claude at ${report.executablePath ?? 'unknown path'}`
            : 'claude not found on PATH',
        },
        {
          name: 'claude-version',
          outcome: report.version ? 'pass' : 'warn',
          message: report.version
            ? `version ${report.version}`
            : 'claude --version produced no output',
        },
        {
          name: 'npm-available',
          outcome: npmAvailable ? 'pass' : 'warn',
          message: npmAvailable
            ? 'npm CLI available'
            : 'npm CLI missing; install/upgrade/uninstall will fail',
        },
        {
          name: 'claude-config',
          outcome: report.configFiles.some((c) => c.exists) ? 'pass' : 'warn',
          message: report.configFiles.some((c) => c.exists)
            ? 'claude config directory present'
            : 'claude config directory not found',
        },
      ],
    };
  }
}

async function npmGlobal(
  ctx: AdapterContext,
  verb: 'install' | 'uninstall',
  spec: string,
  doc: AdapterDocs['install'],
): Promise<MutationResult> {
  const npmPath = which('npm', { platform: ctx.platform });
  if (!npmPath) {
    return {
      ok: false,
      summary: `npm CLI not found; required to ${verb} ${spec} per ${doc.url}`,
    };
  }
  ctx.log(`running npm ${verb} -g ${spec} (docs: ${doc.url})`);
  const result = await runCommand(npmPath, [verb, '-g', spec], {
    signal: ctx.signal,
    allowNonZeroExit: true,
  });
  for (const line of trimLines(result.stdout, result.stderr)) ctx.log(line);
  if (result.exitCode === 0) {
    return { ok: true, summary: `npm ${verb} -g ${spec} completed` };
  }
  return {
    ok: false,
    summary: `npm ${verb} -g ${spec} failed (exit ${result.exitCode ?? 'null'})`,
  };
}

function listConfigFiles() {
  const home = homedir();
  const candidates = [
    join(home, '.claude'),
    join(home, '.claude', 'settings.json'),
  ];
  return candidates.map((path) => ({ path, exists: existsSync(path) }));
}

function inferAuth(
  configFiles: { path: string; exists: boolean }[],
): AgentDetectReport['auth'] {
  const settings = configFiles.find((c) => c.path.endsWith('settings.json'));
  if (settings?.exists) {
    return { kind: 'present', redactedHint: 'claude settings.json present' };
  }
  return { kind: 'missing' };
}

function trimLines(stdout: string, stderr: string): string[] {
  return [stdout, stderr]
    .join('\n')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-30);
}
