import { KubeConfig, CoreV1Api, VersionApi } from '@kubernetes/client-node';
import type { ClusterStatus, PodRow } from '@shared/types';

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

/** List pods in a namespace as flat rows for the resource table. */
export async function listPods(kc: KubeConfig, namespace: string): Promise<PodRow[]> {
  const core = kc.makeApiClient(CoreV1Api);
  const res = await core.listNamespacedPod({ namespace });
  return res.items.map((p) => {
    const cs = p.status?.containerStatuses ?? [];
    const ready = cs.filter((c) => c.ready).length;
    const restarts = cs.reduce((n, c) => n + (c.restartCount ?? 0), 0);
    return {
      name: p.metadata?.name ?? '',
      namespace: p.metadata?.namespace ?? namespace,
      ready: `${ready}/${cs.length || 1}`,
      phase: p.status?.phase ?? 'Unknown',
      restarts,
      node: p.spec?.nodeName ?? '',
      age: age(p.metadata?.creationTimestamp ? new Date(p.metadata.creationTimestamp) : undefined),
    };
  });
}
