import type { ResourceDescriptor } from '@shared/types';

// The curated resource kinds the browser lists/watches (Freelens's registry pattern).
// Each entry knows enough to build a REST path for watches and to drive the generic
// KubernetesObjectApi (which keys off apiVersion + kind). CRD discovery can extend
// this set at runtime later; this covers the everyday operational kinds.
function d(
  id: string, kind: string, apiVersion: string, plural: string,
  namespaced: boolean, category: ResourceDescriptor['category'],
): ResourceDescriptor {
  const [group, version] = apiVersion.includes('/') ? apiVersion.split('/') : ['', apiVersion];
  return { id, kind, apiVersion, group, version, plural, namespaced, category };
}

export const RESOURCES: ResourceDescriptor[] = [
  // Workloads
  d('pods', 'Pod', 'v1', 'pods', true, 'Workloads'),
  d('deployments', 'Deployment', 'apps/v1', 'deployments', true, 'Workloads'),
  d('statefulsets', 'StatefulSet', 'apps/v1', 'statefulsets', true, 'Workloads'),
  d('daemonsets', 'DaemonSet', 'apps/v1', 'daemonsets', true, 'Workloads'),
  d('replicasets', 'ReplicaSet', 'apps/v1', 'replicasets', true, 'Workloads'),
  d('jobs', 'Job', 'batch/v1', 'jobs', true, 'Workloads'),
  d('cronjobs', 'CronJob', 'batch/v1', 'cronjobs', true, 'Workloads'),
  // Network
  d('services', 'Service', 'v1', 'services', true, 'Network'),
  d('ingresses', 'Ingress', 'networking.k8s.io/v1', 'ingresses', true, 'Network'),
  d('endpoints', 'Endpoints', 'v1', 'endpoints', true, 'Network'),
  d('networkpolicies', 'NetworkPolicy', 'networking.k8s.io/v1', 'networkpolicies', true, 'Network'),
  // Config
  d('configmaps', 'ConfigMap', 'v1', 'configmaps', true, 'Config'),
  d('secrets', 'Secret', 'v1', 'secrets', true, 'Config'),
  // Storage
  d('persistentvolumeclaims', 'PersistentVolumeClaim', 'v1', 'persistentvolumeclaims', true, 'Storage'),
  d('persistentvolumes', 'PersistentVolume', 'v1', 'persistentvolumes', false, 'Storage'),
  d('storageclasses', 'StorageClass', 'storage.k8s.io/v1', 'storageclasses', false, 'Storage'),
  // Access
  d('serviceaccounts', 'ServiceAccount', 'v1', 'serviceaccounts', true, 'Access'),
  // Cluster
  d('nodes', 'Node', 'v1', 'nodes', false, 'Cluster'),
  d('namespaces', 'Namespace', 'v1', 'namespaces', false, 'Cluster'),
  d('events', 'Event', 'v1', 'events', true, 'Cluster'),
];

const BY_ID = new Map(RESOURCES.map((r) => [r.id, r]));
export function resourceById(id: string): ResourceDescriptor {
  const r = BY_ID.get(id);
  if (!r) throw new Error(`unknown resource id: ${id}`);
  return r;
}

/** REST path for a list/watch of this kind, optionally scoped to a namespace. */
export function resourcePath(r: ResourceDescriptor, namespace?: string): string {
  const prefix = r.group ? `/apis/${r.group}/${r.version}` : `/api/${r.version}`;
  const ns = r.namespaced && namespace ? `/namespaces/${namespace}` : '';
  return `${prefix}${ns}/${r.plural}`;
}
