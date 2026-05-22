// Thin wrapper around `child_process.spawn` with first-class AbortSignal and
// stdout/stderr capture. Adapters use this for all external commands.

import { spawn, type SpawnOptions } from 'node:child_process';

export interface RunCommandOptions {
  signal?: AbortSignal;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Capped stdout/stderr capture; default 256 KiB each. */
  maxBufferBytes?: number;
  /** When true treat non-zero exit as success (still returns code). */
  allowNonZeroExit?: boolean;
}

export interface RunCommandResult {
  command: string;
  args: string[];
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  /** True when the process was aborted (timeout / cancellation). */
  aborted: boolean;
}

export class CommandError extends Error {
  readonly result: RunCommandResult;
  constructor(message: string, result: RunCommandResult) {
    super(message);
    this.name = 'CommandError';
    this.result = result;
  }
}

const DEFAULT_MAX_BUFFER = 256 * 1024;

export async function runCommand(
  command: string,
  args: string[] = [],
  options: RunCommandOptions = {},
): Promise<RunCommandResult> {
  const maxBuffer = options.maxBufferBytes ?? DEFAULT_MAX_BUFFER;
  const spawnOptions: SpawnOptions = {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    ...(options.env !== undefined ? { env: options.env } : {}),
  };

  return await new Promise<RunCommandResult>((resolve, reject) => {
    let child;
    try {
      child = spawn(command, args, spawnOptions);
    } catch (err) {
      const result: RunCommandResult = {
        command,
        args,
        exitCode: null,
        signal: null,
        stdout: '',
        stderr: err instanceof Error ? err.message : String(err),
        aborted: false,
      };
      if (options.allowNonZeroExit) {
        resolve(result);
        return;
      }
      reject(new CommandError(result.stderr, result));
      return;
    }

    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let aborted = false;

    const onAbort = () => {
      aborted = true;
      try {
        child.kill('SIGTERM');
      } catch {
        /* noop */
      }
    };
    if (options.signal) {
      if (options.signal.aborted) {
        onAbort();
      } else {
        options.signal.addEventListener('abort', onAbort, { once: true });
      }
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdoutBytes >= maxBuffer) return;
      const room = maxBuffer - stdoutBytes;
      const slice = chunk.length > room ? chunk.subarray(0, room) : chunk;
      stdoutBytes += slice.length;
      stdout += slice.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderrBytes >= maxBuffer) return;
      const room = maxBuffer - stderrBytes;
      const slice = chunk.length > room ? chunk.subarray(0, room) : chunk;
      stderrBytes += slice.length;
      stderr += slice.toString('utf8');
    });

    child.on('error', (err) => {
      const result: RunCommandResult = {
        command,
        args,
        exitCode: null,
        signal: null,
        stdout,
        stderr: stderr || err.message,
        aborted,
      };
      if (options.signal) options.signal.removeEventListener('abort', onAbort);
      if (options.allowNonZeroExit) {
        resolve(result);
        return;
      }
      reject(new CommandError(err.message, result));
    });

    child.on('close', (code, sig) => {
      if (options.signal) options.signal.removeEventListener('abort', onAbort);
      const result: RunCommandResult = {
        command,
        args,
        exitCode: code,
        signal: sig,
        stdout,
        stderr,
        aborted,
      };
      if (!options.allowNonZeroExit && (code === null || code !== 0)) {
        if (aborted) {
          reject(new CommandError('Command aborted', result));
          return;
        }
        reject(
          new CommandError(
            `Command "${command}" exited with code ${code ?? 'null'}`,
            result,
          ),
        );
        return;
      }
      resolve(result);
    });
  });
}

/**
 * Try to detect the version of a command. Returns undefined if the binary is
 * missing or fails to print a recognisable version string.
 */
export async function probeVersion(
  command: string,
  args: string[] = ['--version'],
  options: RunCommandOptions = {},
): Promise<{ raw: string; version?: string } | undefined> {
  try {
    const result = await runCommand(command, args, {
      ...options,
      allowNonZeroExit: true,
    });
    const raw = (result.stdout || result.stderr || '').trim();
    if (!raw) return undefined;
    const match = raw.match(/(\d+\.\d+(?:\.\d+)?(?:[-+][\w.]+)?)/);
    return { raw, ...(match ? { version: match[1] } : {}) };
  } catch {
    return undefined;
  }
}
