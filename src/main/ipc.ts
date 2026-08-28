import { ipcMain, app, BrowserWindow } from 'electron';
import type { AwsCreds, ClusterSession, Result, WatchParams, LogParams, ExecParams } from '@shared/types';
import { cases } from './store/cases';
import { dnsLookup, certCheck, certFromPem } from './tools';
import { helmAvailable, helmList, helmHistory, helmValues, helmManifest, helmRollback, helmUpgrade, helmInstall, helmUninstall, helmRepoList, helmRepoAdd, helmRepoRemove, helmSearch } from './helm';
import { listEksClusters, describeEksCluster } from './aws/eks';
import {
  clusterStatus, listResource, getResource, applyYaml, deleteResource,
  scaleWorkload, restartWorkload, cordonNode, drainNode, listEventsFor,
  getLogsOnce, streamLogs,
} from './kube/client';
import { execInPod, execStream, execOnce, shQuote } from './kube/exec';
import { WatchHandle } from './kube/watch';
import { RESOURCES, resourceById } from './kube/resources';
import { actionLog } from './actionLog';
import { sessions } from './session';

// A blank Session Token must be omitted entirely: AWS rejects an EMPTY
// X-Amz-Security-Token ("security token ... is invalid"), and permanent (AKIA)
// keys carry no token at all. Also trim stray whitespace from pasted values.
function normCreds(c: AwsCreds): AwsCreds {
  const accessKeyId = c.accessKeyId.trim();
  let sessionToken = c.sessionToken?.trim() || undefined;
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

async function need(sessionId: string) {
  const s = await sessions.get(sessionId);
  if (!s) throw new Error('session not found — reconnect');
  return s;
}

// Run a mutating op, recording success/failure to the local action log either way.
async function record<T>(
  clusterName: string,
  meta: { verb: string; kind: string; name: string; namespace?: string; detail?: string },
  fn: () => Promise<T>,
): Promise<T> {
  try {
    const out = await fn();
    actionLog.record({ cluster: clusterName, ...meta, ok: true });
    return out;
  } catch (err) {
    actionLog.record({ cluster: clusterName, ...meta, ok: false, error: (err as Error).message });
    throw err;
  }
}

export function registerIpc(): void {
  // ── AWS / connect ────────────────────────────────────────────────
  ipcMain.handle('aws:listClusters', wrap(async (creds: AwsCreds) => listEksClusters(normCreds(creds))));

  ipcMain.handle('aws:connect', wrap(async (rawCreds: AwsCreds, name: string): Promise<ClusterSession> => {
    const creds = normCreds(rawCreds);
    const { endpoint, caData, version } = await describeEksCluster(creds, name);
    const s = await sessions.create(creds, name, endpoint, caData, version);
    return { id: s.id, name: s.name, region: s.region, endpoint: s.endpoint, version: s.version, tokenExpiresAt: s.tokenExpiresAt };
  }));

  ipcMain.handle('cluster:status', wrap(async (id: string) => clusterStatus((await need(id)).kc)));
  ipcMain.handle('cluster:disconnect', wrap(async (id: string) => { sessions.remove(id); return null; }));

  // ── Resource browser (generic CRUD) ──────────────────────────────
  ipcMain.handle('kube:descriptors', async () => RESOURCES);

  ipcMain.handle('kube:list', wrap(async (id: string, resourceId: string, namespace?: string) =>
    listResource((await need(id)).kc, resourceById(resourceId), namespace)));

  ipcMain.handle('kube:get', wrap(async (id: string, resourceId: string, namespace: string | undefined, name: string) =>
    getResource((await need(id)).kc, resourceById(resourceId), namespace, name)));

  ipcMain.handle('kube:events', wrap(async (id: string, namespace: string | undefined, uid: string) =>
    listEventsFor((await need(id)).kc, namespace, uid)));

  // ── Mutations (each writes the action log) ───────────────────────
  ipcMain.handle('kube:apply', wrap(async (id: string, yaml: string) => {
    const s = await need(id);
    return record(s.name, { verb: 'apply', kind: 'YAML', name: '(edit)' }, () => applyYaml(s.kc, yaml));
  }));

  ipcMain.handle('kube:remove', wrap(async (id: string, resourceId: string, namespace: string | undefined, name: string, force?: boolean) => {
    const s = await need(id); const r = resourceById(resourceId);
    await record(s.name, { verb: 'delete', kind: r.kind, name, namespace, detail: force ? 'force' : undefined },
      () => deleteResource(s.kc, r, namespace, name, force));
    return null;
  }));

  ipcMain.handle('kube:scale', wrap(async (id: string, resourceId: string, namespace: string, name: string, replicas: number) => {
    const s = await need(id); const r = resourceById(resourceId);
    await record(s.name, { verb: 'scale', kind: r.kind, name, namespace, detail: `replicas=${replicas}` },
      () => scaleWorkload(s.kc, r, namespace, name, replicas));
    return null;
  }));

  ipcMain.handle('kube:restart', wrap(async (id: string, resourceId: string, namespace: string, name: string) => {
    const s = await need(id); const r = resourceById(resourceId);
    await record(s.name, { verb: 'restart', kind: r.kind, name, namespace }, () => restartWorkload(s.kc, r, namespace, name));
    return null;
  }));

  ipcMain.handle('kube:cordon', wrap(async (id: string, name: string, on: boolean) => {
    const s = await need(id);
    await record(s.name, { verb: on ? 'cordon' : 'uncordon', kind: 'Node', name }, () => cordonNode(s.kc, name, on));
    return null;
  }));

  ipcMain.handle('kube:drain', wrap(async (id: string, name: string) => {
    const s = await need(id);
    return record(s.name, { verb: 'drain', kind: 'Node', name }, () => drainNode(s.kc, name));
  }));

  ipcMain.handle('kube:execOnce', wrap(async (id: string, params: ExecParams) => {
    const s = await need(id);
    return execOnce(s.kc, { namespace: params.namespace, pod: params.pod, container: params.container, command: params.command ?? [] });
  }));

  ipcMain.handle('actionLog:list', wrap(async () => actionLog.list()));

  // ── Live watches (streaming) ─────────────────────────────────────
  const watches = new Map<string, WatchHandle>();
  ipcMain.handle('kube:watch:start', async (e, id: string, params: WatchParams) => {
    const r = resourceById(params.resourceId);
    const chan = `kube:watch:${id}`;
    const h = new WatchHandle(
      () => sessions.get(params.sessionId).then((s) => s?.kc),
      r, params.namespace,
      (ev) => { if (!e.sender.isDestroyed()) e.sender.send(chan, ev); },
    );
    watches.set(id, h);
    h.start();
  });
  ipcMain.handle('kube:watch:stop', (_e, id: string) => { watches.get(id)?.stop(); watches.delete(id); });

  // ── Logs (streaming follow, or tail -F a file for Live Logs) ──────
  const logStreams = new Map<string, { close(): void }>();
  ipcMain.handle('logs:download', wrap(async (id: string, namespace: string, pod: string, container?: string) =>
    getLogsOnce((await need(id)).kc, namespace, pod, container)));

  ipcMain.handle('logs:start', async (e, id: string, params: LogParams) => {
    const chan = `logs:${id}`;
    const send = (chunk: string) => { if (!e.sender.isDestroyed()) e.sender.send(chan, { chunk }); };
    try {
      const s = await need(params.sessionId);
      if (params.filePath) {
        const cmd = ['sh', '-c', `tail -F -n ${params.tailLines ?? 200} ${shQuote(params.filePath)}`];
        logStreams.set(id, await execStream(s.kc, { namespace: params.namespace, pod: params.pod, container: params.container, command: cmd }, send));
      } else {
        const ctrl = await streamLogs(s.kc, params, send);
        logStreams.set(id, { close: () => ctrl.abort() });
      }
    } catch (err) {
      if (!e.sender.isDestroyed()) e.sender.send(chan, { error: (err as Error).message });
    }
  });
  ipcMain.handle('logs:stop', (_e, id: string) => { logStreams.get(id)?.close(); logStreams.delete(id); });

  // ── Interactive exec (streaming, bidirectional) ──────────────────
  const execs = new Map<string, Awaited<ReturnType<typeof execInPod>>>();
  ipcMain.handle('exec:start', async (e, id: string, params: ExecParams) => {
    const chan = `exec:${id}`;
    const send = (m: Record<string, unknown>) => { if (!e.sender.isDestroyed()) e.sender.send(chan, m); };
    try {
      const s = await need(params.sessionId);
      const sess = await execInPod(
        s.kc, params,
        (t) => send({ data: t }),
        (st) => { if (st?.status === 'Failure' && st.message) send({ data: `\r\n[kubeninja] ${st.message}\r\n` }); send({ closed: true }); },
      );
      execs.set(id, sess);
    } catch (err) {
      send({ data: `\r\n[kubeninja] exec failed: ${(err as Error).message}\r\n` });
      send({ closed: true });
    }
  });
  ipcMain.handle('exec:stdin', (_e, id: string, data: string) => execs.get(id)?.write(data));
  ipcMain.handle('exec:resize', (_e, id: string, cols: number, rows: number) => execs.get(id)?.resize(cols, rows));
  ipcMain.handle('exec:stop', (_e, id: string) => { execs.get(id)?.close(); execs.delete(id); });

  // ── Investigation Cases ──────────────────────────────────────────
  ipcMain.handle('cases:list', wrap(async () => cases.list()));
  ipcMain.handle('cases:create', wrap(async (input) => cases.create(input)));
  ipcMain.handle('cases:update', wrap(async (id: string, patch) => cases.update(id, patch)));
  ipcMain.handle('cases:remove', wrap(async (id: string) => { cases.remove(id); return null; }));
  ipcMain.handle('cases:get', wrap(async (id: string) => cases.get(id)));
  ipcMain.handle('cases:addFinding', wrap(async (id: string, input) => cases.addFinding(id, input)));
  ipcMain.handle('cases:updateFinding', wrap(async (id: string, patch) => cases.updateFinding(id, patch)));
  ipcMain.handle('cases:removeFinding', wrap(async (id: string) => { cases.removeFinding(id); return null; }));
  ipcMain.handle('cases:addComment', wrap(async (id: string, input) => cases.addComment(id, input)));
  ipcMain.handle('cases:addEvidence', wrap(async (id: string, input) => cases.addEvidence(id, input)));
  ipcMain.handle('cases:addScreenshot', wrap(async (id: string, input) => cases.addScreenshot(id, input)));
  ipcMain.handle('cases:evidenceDataUrl', wrap(async (id: string) => cases.evidenceDataUrl(id)));
  ipcMain.handle('cases:removeEvidence', wrap(async (id: string) => { cases.removeEvidence(id); return null; }));
  ipcMain.handle('cases:report', wrap(async (id: string, format: 'html' | 'json') => cases.report(id, format)));

  // ── Investigation tools (network-backed) ─────────────────────────
  ipcMain.handle('tools:dns', wrap(async (host: string, type) => dnsLookup(host, type)));
  ipcMain.handle('tools:cert', wrap(async (hostPort: string) => certCheck(hostPort)));
  ipcMain.handle('tools:certPem', wrap(async (pem: string) => certFromPem(pem)));

  // ── Helm ─────────────────────────────────────────────────────────
  ipcMain.handle('helm:available', wrap(async () => helmAvailable()));
  ipcMain.handle('helm:list', wrap(async (id: string, ns?: string) => helmList(id, ns)));
  ipcMain.handle('helm:history', wrap(async (id: string, name: string, ns: string) => helmHistory(id, name, ns)));
  ipcMain.handle('helm:values', wrap(async (id: string, name: string, ns: string) => helmValues(id, name, ns)));
  ipcMain.handle('helm:manifest', wrap(async (id: string, name: string, ns: string) => helmManifest(id, name, ns)));
  ipcMain.handle('helm:rollback', wrap(async (id: string, name: string, ns: string, rev: number) => {
    const s = await need(id);
    return record(s.name, { verb: 'helm-rollback', kind: 'HelmRelease', name, namespace: ns, detail: `rev=${rev}` }, () => helmRollback(id, name, ns, rev));
  }));
  ipcMain.handle('helm:upgrade', wrap(async (id: string, name: string, ns: string, chart: string, version?: string, values?: string) => {
    const s = await need(id);
    return record(s.name, { verb: 'helm-upgrade', kind: 'HelmRelease', name, namespace: ns, detail: chart + (version ? `@${version}` : '') }, () => helmUpgrade(id, name, ns, chart, version, values));
  }));
  ipcMain.handle('helm:install', wrap(async (id: string, name: string, ns: string, chart: string, version?: string, values?: string) => {
    const s = await need(id);
    return record(s.name, { verb: 'helm-install', kind: 'HelmRelease', name, namespace: ns, detail: chart + (version ? `@${version}` : '') }, () => helmInstall(id, name, ns, chart, version, values));
  }));
  ipcMain.handle('helm:uninstall', wrap(async (id: string, name: string, ns: string) => {
    const s = await need(id);
    return record(s.name, { verb: 'helm-uninstall', kind: 'HelmRelease', name, namespace: ns }, () => helmUninstall(id, name, ns));
  }));
  ipcMain.handle('helm:repoList', wrap(async () => helmRepoList()));
  ipcMain.handle('helm:repoAdd', wrap(async (name: string, url: string) => helmRepoAdd(name, url)));
  ipcMain.handle('helm:repoRemove', wrap(async (name: string) => helmRepoRemove(name)));
  ipcMain.handle('helm:search', wrap(async (term: string) => helmSearch(term)));

  ipcMain.handle('app:version', async () => app.getVersion());
  ipcMain.handle('app:capture', wrap(async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (!win) throw new Error('no window to capture');
    const img = await win.webContents.capturePage();
    return img.toDataURL();
  }));
}
