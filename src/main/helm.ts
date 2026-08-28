import { app } from 'electron';
import { execFile } from 'node:child_process';
import { writeFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { KubeConfig } from '@kubernetes/client-node';
import type { HelmRelease, HelmHistoryEntry, HelmChart, HelmRepo } from '@shared/types';
import { sessions } from './session';

/** Resolve the bundled helm binary for this platform (packaged vs dev). */
function helmPath(): string {
  const exe = process.platform === 'win32' ? '.exe' : '';
  if (app.isPackaged) return join(process.resourcesPath, 'bin', 'helm' + exe);
  const map: Record<string, string> = { win32: 'helm-win-x64.exe', darwin: `helm-darwin-${process.arch === 'arm64' ? 'arm64' : 'x64'}`, linux: 'helm-linux-x64' };
  return join(process.cwd(), 'resources', 'bin', map[process.platform] ?? 'helm');
}

export function helmAvailable(): boolean {
  return existsSync(helmPath());
}

// Build a self-contained kubeconfig YAML from the session's live token.
function kubeconfigYaml(name: string, endpoint: string, caData: string, token: string): string {
  return [
    'apiVersion: v1', 'kind: Config', `current-context: ${name}`,
    'clusters:', `- name: ${name}`, '  cluster:', `    server: ${endpoint}`, `    certificate-authority-data: ${caData}`,
    'contexts:', `- name: ${name}`, '  context:', `    cluster: ${name}`, '    user: kubeninja',
    'users:', '- name: kubeninja', '  user:', `    token: ${token}`, '',
  ].join('\n');
}

function currentToken(kc: KubeConfig): string {
  const user = kc.getCurrentUser();
  const token = (user as { token?: string } | null)?.token;
  if (!token) throw new Error('no bearer token on the session');
  return token;
}

/**
 * Run helm against the session's cluster using a transient, locked kubeconfig
 * written with the current STS token, deleted after the call.
 */
async function runHelm(sessionId: string, args: string[]): Promise<string> {
  if (!helmAvailable()) throw new Error('helm binary not bundled with this build');
  const s = await sessions.get(sessionId);
  if (!s) throw new Error('session not found — reconnect');

  const dir = join(tmpdir(), 'kubeninja');
  mkdirSync(dir, { recursive: true });
  const cfg = join(dir, `kubeconfig-${randomUUID()}.yaml`);
  writeFileSync(cfg, kubeconfigYaml(s.name, s.endpoint, s.caData, currentToken(s.kc)), { mode: 0o600 });

  try {
    return await new Promise<string>((resolve, reject) => {
      execFile(helmPath(), args, { env: { ...process.env, KUBECONFIG: cfg }, timeout: 120_000, maxBuffer: 32 * 1024 * 1024, windowsHide: true },
        (err, stdout, stderr) => {
          if (err) reject(new Error((stderr || err.message).toString().trim()));
          else resolve(stdout.toString());
        });
    });
  } finally {
    try { rmSync(cfg, { force: true }); } catch { /* best-effort */ }
  }
}

interface RawRelease { name: string; namespace: string; revision: string; updated: string; status: string; chart: string; app_version: string }
interface RawHistory { revision: number; updated: string; status: string; chart: string; app_version: string; description: string }

export async function helmList(sessionId: string, namespace?: string): Promise<HelmRelease[]> {
  const args = namespace ? ['list', '-n', namespace, '-o', 'json'] : ['list', '-A', '-o', 'json'];
  const raw = JSON.parse(await runHelm(sessionId, args) || '[]') as RawRelease[];
  return raw.map((r) => ({ name: r.name, namespace: r.namespace, revision: Number(r.revision), updated: r.updated, status: r.status, chart: r.chart, appVersion: r.app_version }));
}

export async function helmHistory(sessionId: string, name: string, namespace: string): Promise<HelmHistoryEntry[]> {
  const raw = JSON.parse(await runHelm(sessionId, ['history', name, '-n', namespace, '-o', 'json']) || '[]') as RawHistory[];
  return raw.map((h) => ({ revision: h.revision, updated: h.updated, status: h.status, chart: h.chart, appVersion: h.app_version, description: h.description })).reverse();
}

export const helmValues = (sessionId: string, name: string, ns: string) => runHelm(sessionId, ['get', 'values', name, '-n', ns, '-a']);
export const helmManifest = (sessionId: string, name: string, ns: string) => runHelm(sessionId, ['get', 'manifest', name, '-n', ns]);
export const helmNotes = (sessionId: string, name: string, ns: string) => runHelm(sessionId, ['get', 'notes', name, '-n', ns]);
export const helmRollback = (sessionId: string, name: string, ns: string, revision: number) => runHelm(sessionId, ['rollback', name, String(revision), '-n', ns, '--wait', '--timeout', '2m']);
export const helmUninstall = (sessionId: string, name: string, ns: string) => runHelm(sessionId, ['uninstall', name, '-n', ns]);

// Install/upgrade optionally take a values YAML (written to a temp -f file, deleted after).
async function withValues<T>(values: string | undefined, fn: (extra: string[]) => Promise<T>): Promise<T> {
  if (!values || !values.trim()) return fn([]);
  const dir = join(tmpdir(), 'kubeninja'); mkdirSync(dir, { recursive: true });
  const vf = join(dir, `values-${randomUUID()}.yaml`);
  writeFileSync(vf, values, { mode: 0o600 });
  try { return await fn(['-f', vf]); } finally { try { rmSync(vf, { force: true }); } catch { /* best-effort */ } }
}
export function helmUpgrade(sessionId: string, name: string, ns: string, chart: string, version?: string, values?: string) {
  return withValues(values, (extra) => runHelm(sessionId, ['upgrade', name, chart, '-n', ns, ...(version ? ['--version', version] : []), ...extra, '--wait', '--timeout', '3m']));
}
export function helmInstall(sessionId: string, name: string, ns: string, chart: string, version?: string, values?: string) {
  return withValues(values, (extra) => runHelm(sessionId, ['install', name, chart, '-n', ns, '--create-namespace', ...(version ? ['--version', version] : []), ...extra, '--wait', '--timeout', '3m']));
}

// ── Repositories + chart search (no cluster needed) ───────────────────
function runHelmPlain(args: string[]): Promise<string> {
  if (!helmAvailable()) throw new Error('helm binary not bundled with this build');
  return new Promise((resolve, reject) => {
    execFile(helmPath(), args, { timeout: 60_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => (err ? reject(new Error((stderr || err.message).toString().trim())) : resolve(stdout.toString())));
  });
}
export const helmRepoAdd = (name: string, url: string) => runHelmPlain(['repo', 'add', name, url, '--force-update']).then(() => runHelmPlain(['repo', 'update', name])).then(() => `added ${name}`);
export const helmRepoRemove = (name: string) => runHelmPlain(['repo', 'remove', name]);
export async function helmRepoList(): Promise<HelmRepo[]> {
  try { return JSON.parse(await runHelmPlain(['repo', 'list', '-o', 'json']) || '[]') as HelmRepo[]; } catch { return []; }
}
export async function helmSearch(term: string): Promise<HelmChart[]> {
  const raw = JSON.parse(await runHelmPlain(['search', 'repo', term, '-o', 'json']) || '[]') as { name: string; version: string; app_version: string; description: string }[];
  return raw.map((c) => ({ name: c.name, version: c.version, appVersion: c.app_version, description: c.description }));
}
