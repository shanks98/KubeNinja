import { ipcMain, app } from 'electron';
import type { AwsCreds, ClusterSession, Result } from '@shared/types';
import { listEksClusters, describeEksCluster } from './aws/eks';
import { clusterStatus, listPods } from './kube/client';
import { sessions } from './session';

// A blank Session Token must be omitted entirely: AWS rejects an EMPTY
// X-Amz-Security-Token ("security token ... is invalid"), and permanent (AKIA)
// keys carry no token at all. Also trim stray whitespace from pasted values.
function normCreds(c: AwsCreds): AwsCreds {
  const accessKeyId = c.accessKeyId.trim();
  let sessionToken = c.sessionToken?.trim() || undefined;
  // Permanent IAM keys (AKIA…) never carry a session token; a stray one here just
  // yields "security token invalid". Only temporary keys (ASIA…) use one.
  if (accessKeyId.startsWith('AKIA')) sessionToken = undefined;
  return {
    accessKeyId,
    secretAccessKey: c.secretAccessKey.trim(),
    sessionToken,
    region: c.region,
    endpoint: c.endpoint?.trim() || undefined,
  };
}

// Wrap a handler so any throw becomes a typed { ok:false } result the renderer can show.
function wrap<A extends unknown[], T>(fn: (...args: A) => Promise<T>) {
  return async (_e: unknown, ...args: A): Promise<Result<T>> => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      const e = err as { message?: string; name?: string };
      return { ok: false, error: e?.message ?? String(err), code: e?.name };
    }
  };
}

export function registerIpc(): void {
  ipcMain.handle('aws:listClusters', wrap(async (creds: AwsCreds) => listEksClusters(normCreds(creds))));

  ipcMain.handle('aws:connect', wrap(async (rawCreds: AwsCreds, name: string): Promise<ClusterSession> => {
    const creds = normCreds(rawCreds);
    const { endpoint, caData, version } = await describeEksCluster(creds, name);
    const s = await sessions.create(creds, name, endpoint, caData, version);
    return { id: s.id, name: s.name, region: s.region, endpoint: s.endpoint, version: s.version, tokenExpiresAt: s.tokenExpiresAt };
  }));

  ipcMain.handle('cluster:status', wrap(async (id: string) => {
    const s = await sessions.get(id);
    if (!s) throw new Error('session not found — reconnect');
    return clusterStatus(s.kc);
  }));

  ipcMain.handle('cluster:listPods', wrap(async (id: string, namespace: string) => {
    const s = await sessions.get(id);
    if (!s) throw new Error('session not found — reconnect');
    return listPods(s.kc, namespace);
  }));

  ipcMain.handle('cluster:disconnect', wrap(async (id: string) => {
    sessions.remove(id);
    return null;
  }));

  ipcMain.handle('app:version', async () => app.getVersion());
}
