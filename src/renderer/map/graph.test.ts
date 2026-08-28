import { describe, it, expect } from 'vitest';
import { buildGraph } from './graph';
import type { RawKubeObject } from '@shared/types';

const o = (kind: string, name: string, extra: Partial<RawKubeObject> = {}): RawKubeObject =>
  ({ kind, metadata: { uid: `${kind}-${name}`, name, namespace: 'shop', ...(extra.metadata ?? {}) }, spec: extra.spec, status: extra.status });

describe('buildGraph', () => {
  it('links ownerReferences, service selection, ingress routes and pod mounts', () => {
    const pods: RawKubeObject[] = [
      o('Pod', 'web-1', { metadata: { uid: 'Pod-web-1', name: 'web-1', namespace: 'shop', labels: { app: 'web' }, ownerReferences: [{ kind: 'ReplicaSet', name: 'web-rs', uid: 'ReplicaSet-web-rs' }] }, status: { phase: 'Running' }, spec: { volumes: [{ persistentVolumeClaim: { claimName: 'web-data' } }, { configMap: { name: 'web-config' } }] } }),
    ];
    const graph = buildGraph({
      pods,
      replicasets: [o('ReplicaSet', 'web-rs')],
      services: [o('Service', 'web-svc', { spec: { selector: { app: 'web' } } })],
      ingresses: [o('Ingress', 'web-ing', { spec: { rules: [{ http: { paths: [{ backend: { service: { name: 'web-svc' } } }] } }] } })],
      persistentvolumeclaims: [o('PersistentVolumeClaim', 'web-data')],
      configmaps: [o('ConfigMap', 'web-config')],
    });
    const has = (s: string, t: string, k: string) => graph.edges.some((e) => e.source === s && e.target === t && e.kind === k);
    expect(has('ReplicaSet-web-rs', 'Pod-web-1', 'owns')).toBe(true);
    expect(has('Service-web-svc', 'Pod-web-1', 'selects')).toBe(true);
    expect(has('Ingress-web-ing', 'Service-web-svc', 'routes')).toBe(true);
    expect(has('Pod-web-1', 'PersistentVolumeClaim-web-data', 'mounts')).toBe(true);
    expect(has('Pod-web-1', 'ConfigMap-web-config', 'uses')).toBe(true);
    expect(graph.nodes.find((n) => n.id === 'Pod-web-1')?.status).toBe('ok');
  });

  it('does not link a service to a pod that does not match the selector', () => {
    const graph = buildGraph({
      pods: [o('Pod', 'api-1', { metadata: { uid: 'Pod-api-1', name: 'api-1', namespace: 'shop', labels: { app: 'api' } } })],
      services: [o('Service', 'web-svc', { spec: { selector: { app: 'web' } } })],
    });
    expect(graph.edges.some((e) => e.kind === 'selects')).toBe(false);
  });
});
