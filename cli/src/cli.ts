// Top-level CLI dispatcher. Plain argv parsing keeps the v1 runner free of
// dependencies; subcommands are easy to add by extending the `dispatch` switch.

import { HELP_TEXT } from './commands/help.ts';
import { runLogin } from './commands/login.ts';
import { runDaemon } from './commands/daemon.ts';
import { buildStatus, formatStatus } from './commands/status.ts';
import { RUNNER_VERSION } from './version.ts';
import { logger } from './utils/logger.ts';

interface ParsedArgs {
  command: string;
  options: Record<string, string | boolean>;
  positional: string[];
}

export function parseArgs(argv: string[]): ParsedArgs {
  const args = [...argv];
  const command = args.shift() ?? 'help';
  const options: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === undefined) continue;
    if (token === '--') {
      positional.push(...args.slice(i + 1));
      break;
    }
    if (token.startsWith('--')) {
      const eq = token.indexOf('=');
      if (eq !== -1) {
        options[token.slice(2, eq)] = token.slice(eq + 1);
        continue;
      }
      const next = args[i + 1];
      if (next === undefined || next.startsWith('-')) {
        options[token.slice(2)] = true;
        continue;
      }
      options[token.slice(2)] = next;
      i += 1;
    } else if (token.startsWith('-') && token.length > 1) {
      const short = token.slice(1);
      const next = args[i + 1];
      if (next === undefined || next.startsWith('-')) {
        options[short] = true;
        continue;
      }
      options[short] = next;
      i += 1;
    } else {
      positional.push(token);
    }
  }
  return { command, options, positional };
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  if (argv.length === 0) {
    process.stdout.write(HELP_TEXT);
    return 0;
  }
  const cmd = argv[0];
  if (cmd === '--help' || cmd === '-h' || cmd === 'help') {
    process.stdout.write(HELP_TEXT);
    return 0;
  }
  if (cmd === '--version' || cmd === '-v' || cmd === 'version') {
    process.stdout.write(`agentops-runner ${RUNNER_VERSION}\n`);
    return 0;
  }
  const parsed = parseArgs(argv);
  try {
    switch (parsed.command) {
      case 'login':
        return await commandLogin(parsed);
      case 'daemon':
        return await commandDaemon();
      case 'status':
        return commandStatus();
      default:
        process.stderr.write(`Unknown command: ${parsed.command}\n\n`);
        process.stdout.write(HELP_TEXT);
        return 1;
    }
  } catch (err) {
    logger.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

async function commandLogin(parsed: ParsedArgs): Promise<number> {
  const serverUrl = optionString(parsed, ['server', 'server-url']);
  const loginToken = optionString(parsed, ['token']);
  const displayName = optionString(parsed, ['name', 'display-name']);
  if (!serverUrl || !loginToken) {
    process.stderr.write(
      'login requires --server <url> and --token <token>.\n',
    );
    return 2;
  }
  const result = await runLogin({
    serverUrl,
    loginToken,
    ...(displayName ? { displayName } : {}),
  });
  process.stdout.write(
    `Logged in as machine ${result.credentials.machineId} -> ${result.credentials.serverUrl}\n`,
  );
  return 0;
}

async function commandDaemon(): Promise<number> {
  const handle = runDaemon();
  const cleanup = async () => {
    await handle.stop();
  };
  process.once('SIGINT', cleanup);
  process.once('SIGTERM', cleanup);
  await handle.done;
  return typeof process.exitCode === 'number' ? process.exitCode : 0;
}

function commandStatus(): number {
  const status = buildStatus();
  process.stdout.write(`${formatStatus(status)}\n`);
  return 0;
}

function optionString(
  parsed: ParsedArgs,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = parsed.options[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}
