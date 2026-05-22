// Codex (OpenAI Codex CLI) adapter.
//
// Documentation references:
//   Repo & install: https://github.com/openai/codex
//   npm package:    https://www.npmjs.com/package/@openai/codex
//
// Codex CLI is shipped as an npm package, so install/upgrade/uninstall are
// driven by `npm install -g @openai/codex` and `npm uninstall -g @openai/codex`
// per the project README.

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

const PACKAGE_NAME = '@openai/codex';
const CLI_COMMAND = 'codex';

const DOCS: AdapterDocs = {
  install: {
    title: 'OpenAI Codex - Install',
    url: 'https://github.com/openai/codex#installation',
  },
  upgrade: {
    title: 'OpenAI Codex - Upgrade',
    url: 'https://github.com/openai/codex#installation',
  },
  uninstall: {
    title: 'OpenAI Codex - Uninstall',
    url: 'https://github.com/openai/codex#installation',
  },
};

export class CodexAdapter implements AgentAdapter {
  readonly agentType = 'codex' as const;
  readonly displayName = 'Codex';
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
    const configFiles = listCodexConfigFiles();
    const auth = inferAuth(configFiles);

    const report: AgentDetectReport = {
      agentType: 'codex',
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
      report.notes?.push('codex on PATH but --version produced no output');
    }
    return report;
  }

  async install(ctx: AdapterContext): Promise<MutationResult> {
    return await npmGlobal(ctx, 'install', PACKAGE_NAME, DOCS.install);
  }

  async upgrade(ctx: AdapterContext): Promise<MutationResult> {
    // npm install -g <pkg>@latest is the documented upgrade path.
    return await npmGlobal(ctx, 'install', `${PACKAGE_NAME}@latest`, DOCS.upgrade);
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
          name: 'codex-on-path',
          outcome: report.onPath ? 'pass' : 'warn',
          message: report.onPath
            ? `codex at ${report.executablePath ?? 'unknown path'}`
            : 'codex not found on PATH',
        },
        {
          name: 'codex-version',
          outcome: report.version ? 'pass' : 'warn',
          message: report.version
            ? `version ${report.version}`
            : 'codex --version produced no output',
        },
        {
          name: 'npm-available',
          outcome: npmAvailable ? 'pass' : 'warn',
          message: npmAvailable
            ? 'npm CLI available for install/upgrade/uninstall'
            : 'npm CLI missing; install/upgrade/uninstall will fail',
        },
        {
          name: 'codex-config',
          outcome: report.configFiles.some((c) => c.exists) ? 'pass' : 'warn',
          message: report.configFiles.some((c) => c.exists)
            ? 'codex config directory present'
            : 'codex config directory not found',
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
    return {
      ok: true,
      summary: `npm ${verb} -g ${spec} completed`,
    };
  }
  return {
    ok: false,
    summary: `npm ${verb} -g ${spec} failed (exit ${result.exitCode ?? 'null'})`,
  };
}

function listCodexConfigFiles() {
  const home = homedir();
  const candidates = [join(home, '.codex'), join(home, '.codex', 'config.json')];
  return candidates.map((path) => ({ path, exists: existsSync(path) }));
}

function inferAuth(
  configFiles: { path: string; exists: boolean }[],
): AgentDetectReport['auth'] {
  const cfg = configFiles.find((c) => c.path.endsWith('config.json'));
  if (cfg?.exists) {
    return { kind: 'present', redactedHint: 'codex config.json present' };
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
