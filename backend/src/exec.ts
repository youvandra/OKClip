import { spawn } from "node:child_process";

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  /** Kill the process after this many ms. */
  timeoutMs?: number;
  /** Working directory. */
  cwd?: string;
}

/**
 * Run an external command without a shell (no injection surface) and collect
 * its output. Rejects on spawn error or timeout; resolves with the exit code
 * otherwise so callers can decide what a non-zero code means.
 */
export function run(
  cmd: string,
  args: string[],
  options: ExecOptions = {},
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: options.cwd });
    let stdout = "";
    let stderr = "";
    let timer: NodeJS.Timeout | undefined;

    if (options.timeoutMs) {
      timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`${cmd} timed out after ${options.timeoutMs}ms`));
      }, options.timeoutMs);
    }

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}
