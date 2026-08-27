import { Exec, KubeConfig } from '@kubernetes/client-node';
import { PassThrough, Writable } from 'node:stream';
import type { V1Status } from '@kubernetes/client-node';

export interface ExecSession {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  close(): void;
}

// Default shell probe, same as Freelens's pod terminal: try bash, then ash, then sh.
const DEFAULT_CMD = ['sh', '-c', 'clear; (bash || ash || sh)'];

/**
 * Open an interactive exec session into a pod container. stdout/stderr are
 * forwarded to `onData`; the returned handle writes stdin and resizes the TTY.
 * Resize works because client-node's Exec calls handleResizes() on the stdout
 * stream — so we make stdout carry `columns`/`rows` and emit 'resize'.
 */
export async function execInPod(
  kc: KubeConfig,
  params: { namespace: string; pod: string; container?: string; command?: string[] },
  onData: (text: string) => void,
  onStatus: (status: V1Status) => void,
): Promise<ExecSession> {
  const stdin = new PassThrough();

  const stdout = new Writable({
    write(chunk, _enc, cb) { onData(chunk.toString('utf8')); cb(); },
  }) as Writable & { columns: number; rows: number };
  stdout.columns = 80;
  stdout.rows = 24;

  const stderr = new Writable({
    write(chunk, _enc, cb) { onData(chunk.toString('utf8')); cb(); },
  });

  const ws = await new Exec(kc).exec(
    params.namespace,
    params.pod,
    params.container ?? '',
    params.command && params.command.length ? params.command : DEFAULT_CMD,
    stdout,
    stderr,
    stdin,
    true, // tty
    onStatus,
  );

  return {
    write: (data: string) => stdin.write(data),
    resize: (cols: number, rows: number) => {
      stdout.columns = cols;
      stdout.rows = rows;
      stdout.emit('resize');
    },
    close: () => {
      try { stdin.end(); } catch { /* already closed */ }
      try { ws.close(); } catch { /* already closed */ }
    },
  };
}

/**
 * Run a non-interactive command in a container and stream its stdout/stderr to
 * `onData`. Used by "Live Logs" (`tail -F <file>`) — net-new vs Freelens, built on
 * the same exec channel. Returns a closer.
 */
export async function execStream(
  kc: KubeConfig,
  params: { namespace: string; pod: string; container?: string; command: string[] },
  onData: (text: string) => void,
): Promise<{ close(): void }> {
  const sink = () => new Writable({ write(chunk, _enc, cb) { onData(chunk.toString('utf8')); cb(); } });
  const ws = await new Exec(kc).exec(
    params.namespace, params.pod, params.container ?? '',
    params.command, sink(), sink(), null, false,
  );
  return { close: () => { try { ws.close(); } catch { /* already closed */ } } };
}

/** Shell-quote a single argument for a `sh -c` command line. */
export function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Run a command to completion in a container and return its combined stdout/stderr.
 * Used by the Trace panel to POST a log-level change to a JVM actuator endpoint from
 * inside the pod. Resolves when the socket closes or after `timeoutMs`.
 */
export async function execOnce(
  kc: KubeConfig,
  params: { namespace: string; pod: string; container?: string; command: string[] },
  timeoutMs = 8000,
): Promise<string> {
  let out = '';
  const sink = () => new Writable({ write(chunk, _enc, cb) { out += chunk.toString('utf8'); cb(); } });
  const ws = await new Exec(kc).exec(
    params.namespace, params.pod, params.container ?? '', params.command, sink(), sink(), null, false,
  );
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => { try { ws.close(); } catch { /* closed */ } resolve(out); }, timeoutMs);
    ws.on('close', () => { clearTimeout(timer); resolve(out); });
    ws.on('error', (err: unknown) => { clearTimeout(timer); reject(err); });
  });
}
