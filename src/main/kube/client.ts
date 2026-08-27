import { KubeConfig, CoreV1Api, VersionApi, KubernetesObjectApi, PatchStrategy, Log } from '@kubernetes/client-node';
import { Writable } from 'node:stream';
import { load as loadYaml } from 'js-yaml';
import type { ClusterStatus, RawKubeObject, ResourceDescriptor } from '@shared/types';

/**
 * Build an in-memory Kubernetes client for an EKS cluster from its endpoint, CA,
 * and a bearer token. Nothing is written to disk — the whole config lives in the
 * KubeConfig object in the main process.
 */
export function makeKubeConfig(name: string, endpoint: string, caData: string, token: string): KubeConfig {
  const kc = new KubeConfig();
  kc.loadFromOptions({
    clusters: [{ name, server: endpoint, caData }],
    users: [{ name: 'kubeninja', token }],
    contexts: [{ name, cluster: name, user: 'kubeninja' }],
    currentContext: name,
  });
  return kc;
}

function age(created?: Date): string {
  if (!created) return '';
  const s = Math.floor((Date.now() - created.getTime()) / 1000);
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** Fetch a quick health snapshot — proves the token + connection actually work. */
export async function clusterStatus(kc: KubeConfig): Promise<ClusterStatus> {
  const core = kc.makeApiClient(CoreV1Api);
  const versionApi = kc.makeApiClient(VersionApi);
  const [ver, nodes, namespaces] = await Promise.all([
    versionApi.getCode(),
    core.listNode(),
    core.listNamespace(),
  ]);
  const nsNames = namespaces.items.map((n) => n.metadata?.name ?? '').filter(Boolean).sort();
  return {
    version: `${ver.gitVersion ?? ver.major + '.' + ver.minor}`,
    nodeCount: nodes.items.length,
    namespaceCount: nsNames.length,
    namespaces: nsNames,
  };
}

const objApi = (kc: KubeConfig) => kc.makeApiClient(KubernetesObjectApi);

/** List every object of a kind, optionally scoped to a namespace. */
export async function listResource(kc: KubeConfig, r: ResourceDescriptor, namespace?: string): Promise<RawKubeObject[]> {
  const res = await objApi(kc).list(r.apiVersion, r.kind, r.namespaced ? namespace : undefined);
  return (res.items ?? []) as unknown as RawKubeObject[];
}

/** Read a single object (fresh copy — used before edit/apply). */
export async function getResource(kc: KubeConfig, r: ResourceDescriptor, namespace: string | undefined, name: string): Promise<RawKubeObject> {
  const spec = { apiVersion: r.apiVersion, kind: r.kind, metadata: { name, namespace: r.namespaced ? namespace : undefined } };
  return (await objApi(kc).read(spec)) as unknown as RawKubeObject;
}

/** Apply edited YAML: create if new, otherwise replace (preserving resourceVersion). */
export async function applyYaml(kc: KubeConfig, yamlText: string): Promise<RawKubeObject> {
  const obj = loadYaml(yamlText) as RawKubeObject;
  if (!obj || !obj.kind || !obj.apiVersion) throw new Error('YAML must have apiVersion and kind');
  const api = objApi(kc);
  try {
    const existing = (await api.read(obj as never)) as unknown as RawKubeObject;
    obj.metadata = { ...obj.metadata, resourceVersion: existing.metadata.resourceVersion };
    return (await api.replace(obj as never)) as unknown as RawKubeObject;
  } catch {
    return (await api.create(obj as never)) as unknown as RawKubeObject;
  }
}

/** Delete an object. `force` sets a zero grace period (immediate). */
export async function deleteResource(kc: KubeConfig, r: ResourceDescriptor, namespace: string | undefined, name: string, force = false): Promise<void> {
  const spec = { apiVersion: r.apiVersion, kind: r.kind, metadata: { name, namespace: r.namespaced ? namespace : undefined } };
  await objApi(kc).delete(spec, undefined, undefined, force ? 0 : undefined, undefined, 'Background');
}

/** Scale a workload by merge-patching spec.replicas. */
export async function scaleWorkload(kc: KubeConfig, r: ResourceDescriptor, namespace: string, name: string, replicas: number): Promise<void> {
  const spec = { apiVersion: r.apiVersion, kind: r.kind, metadata: { name, namespace }, spec: { replicas } };
  await objApi(kc).patch(spec as never, undefined, undefined, undefined, undefined, PatchStrategy.MergePatch);
}

/** Rollout-restart a workload the way kubectl does: stamp a restartedAt annotation on the pod template. */
export async function restartWorkload(kc: KubeConfig, r: ResourceDescriptor, namespace: string, name: string): Promise<void> {
  const spec = {
    apiVersion: r.apiVersion, kind: r.kind, metadata: { name, namespace },
    spec: { template: { metadata: { annotations: { 'kubectl.kubernetes.io/restartedAt': new Date().toISOString() } } } },
  };
  await objApi(kc).patch(spec as never, undefined, undefined, undefined, undefined, PatchStrategy.StrategicMergePatch);
}

/** Cordon (unschedulable=true) or uncordon a node. */
export async function cordonNode(kc: KubeConfig, name: string, on: boolean): Promise<void> {
  const spec = { apiVersion: 'v1', kind: 'Node', metadata: { name }, spec: { unschedulable: on } };
  await objApi(kc).patch(spec as never, undefined, undefined, undefined, undefined, PatchStrategy.MergePatch);
}

/** Drain a node: cordon, then evict every non-DaemonSet, non-mirror pod scheduled on it. */
export async function drainNode(kc: KubeConfig, name: string): Promise<{ evicted: number; skipped: number }> {
  await cordonNode(kc, name, true);
  const core = kc.makeApiClient(CoreV1Api);
  const pods = await core.listPodForAllNamespaces({ fieldSelector: `spec.nodeName=${name}` });
  let evicted = 0;
  let skipped = 0;
  for (const p of pods.items) {
    const owner = p.metadata?.ownerReferences?.[0]?.kind;
    const mirror = p.metadata?.annotations?.['kubernetes.io/config.mirror'];
    if (owner === 'DaemonSet' || mirror) { skipped++; continue; }
    const ns = p.metadata?.namespace ?? 'default';
    const pn = p.metadata?.name ?? '';
    await core.createNamespacedPodEviction({
      name: pn, namespace: ns,
      body: { apiVersion: 'policy/v1', kind: 'Eviction', metadata: { name: pn, namespace: ns } },
    });
    evicted++;
  }
  return { evicted, skipped };
}

/** Events referencing a given object uid (the details drawer's Events tab). */
export async function listEventsFor(kc: KubeConfig, namespace: string | undefined, uid: string): Promise<RawKubeObject[]> {
  const res = await objApi(kc).list('v1', 'Event', namespace, undefined, undefined, undefined, `involvedObject.uid=${uid}`);
  return (res.items ?? []) as unknown as RawKubeObject[];
}

/** Fetch a bounded, non-following snapshot of container logs (used for download). */
export async function getLogsOnce(kc: KubeConfig, namespace: string, pod: string, container: string | undefined, tailLines = 5000): Promise<string> {
  const core = kc.makeApiClient(CoreV1Api);
  const res = await core.readNamespacedPodLog({ name: pod, namespace, container, tailLines, timestamps: false });
  return typeof res === 'string' ? res : '';
}

/**
 * Follow a pod's container logs, forwarding each chunk to `onChunk`. Returns an
 * AbortController — abort() to stop the stream. `age()` above is unrelated here.
 */
export async function streamLogs(
  kc: KubeConfig,
  opts: { namespace: string; pod: string; container?: string; tailLines?: number; previous?: boolean; timestamps?: boolean },
  onChunk: (text: string) => void,
): Promise<AbortController> {
  const sink = new Writable({
    write(chunk, _enc, cb) { onChunk(chunk.toString('utf8')); cb(); },
  });
  return new Log(kc).log(opts.namespace, opts.pod, opts.container ?? '', sink, {
    follow: true,
    tailLines: opts.tailLines ?? 500,
    previous: opts.previous ?? false,
    timestamps: opts.timestamps ?? false,
    pretty: false,
  });
}

export { age };
