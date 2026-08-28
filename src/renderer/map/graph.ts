import type { RawKubeObject, ResourceGraph, GraphNode, GraphEdge } from '@shared/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function uid(o: RawKubeObject): string {
  return o.metadata.uid ?? `${o.kind}/${o.metadata.namespace ?? '~'}/${o.metadata.name}`;
}

function podStatus(o: RawKubeObject): GraphNode['status'] {
  const st = o.status as Any;
  const cs: Any[] = st?.containerStatuses ?? [];
  if (cs.some((c) => /CrashLoopBackOff|Error|ImagePullBackOff|ErrImagePull/.test(c.state?.waiting?.reason ?? ''))) return 'err';
  const phase = st?.phase;
  return phase === 'Running' || phase === 'Succeeded' ? 'ok' : phase === 'Pending' ? 'warn' : 'off';
}
function workloadStatus(o: RawKubeObject): GraphNode['status'] {
  const spec = o.spec as Any; const st = o.status as Any;
  const want = spec?.replicas ?? st?.desiredNumberScheduled ?? 1;
  const ready = st?.readyReplicas ?? st?.numberReady ?? 0;
  if (want === 0) return 'off';
  return ready >= want ? 'ok' : ready === 0 ? 'err' : 'warn';
}

/**
 * Build a topology graph for a namespace from the fetched resources: ownerRef
 * chains (Deployment→ReplicaSet→Pod, StatefulSet/Job→Pod), Service→Pod label
 * selection, Ingress→Service routes, and Pod→PVC/ConfigMap/Secret mounts.
 */
export function buildGraph(byKind: Record<string, RawKubeObject[]>): ResourceGraph {
  const nodes: GraphNode[] = [];
  const byUid = new Map<string, RawKubeObject>();
  const byName = new Map<string, string>(); // `${kind}/${ns}/${name}` -> uid
  const push = (o: RawKubeObject, resourceId: string, status?: GraphNode['status']) => {
    const id = uid(o);
    if (byUid.has(id)) return;
    byUid.set(id, o);
    byName.set(`${o.kind}/${o.metadata.namespace ?? ''}/${o.metadata.name}`, id);
    nodes.push({ id, kind: o.kind ?? resourceId, name: o.metadata.name ?? '', namespace: o.metadata.namespace, status, resourceId });
  };

  const RID: Record<string, string> = { Pod: 'pods', Deployment: 'deployments', ReplicaSet: 'replicasets', StatefulSet: 'statefulsets', DaemonSet: 'daemonsets', Job: 'jobs', CronJob: 'cronjobs', Service: 'services', Ingress: 'ingresses', PersistentVolumeClaim: 'persistentvolumeclaims', ConfigMap: 'configmaps', Secret: 'secrets' };
  for (const [rid, list] of Object.entries(byKind)) {
    for (const o of list ?? []) {
      const kind = o.kind ?? '';
      const status = kind === 'Pod' ? podStatus(o) : /Deployment|StatefulSet|ReplicaSet|DaemonSet/.test(kind) ? workloadStatus(o) : undefined;
      push(o, RID[kind] ?? rid, status);
    }
  }

  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const link = (source: string, target: string, kind: GraphEdge['kind']) => {
    if (!source || !target || source === target) return;
    const key = `${source}->${target}:${kind}`;
    if (seen.has(key)) return; seen.add(key);
    edges.push({ source, target, kind });
  };
  const nameToUid = (kind: string, ns: string | undefined, name: string) => byName.get(`${kind}/${ns ?? ''}/${name}`);

  for (const o of byUid.values()) {
    const id = uid(o);
    const ns = o.metadata.namespace;
    const spec = o.spec as Any;

    for (const owner of o.metadata.ownerReferences ?? []) {
      if (byUid.has(owner.uid)) link(owner.uid, id, 'owns');
    }

    if (o.kind === 'Service' && spec?.selector && Object.keys(spec.selector).length) {
      const sel = spec.selector as Record<string, string>;
      for (const p of byKind.pods ?? []) {
        const labels = p.metadata.labels ?? {};
        if (Object.entries(sel).every(([k, v]) => labels[k] === v)) link(id, uid(p), 'selects');
      }
    }

    if (o.kind === 'Ingress') {
      const backends: string[] = [];
      const db = spec?.defaultBackend?.service?.name; if (db) backends.push(db);
      for (const r of spec?.rules ?? []) for (const path of r.http?.paths ?? []) { const n = path.backend?.service?.name; if (n) backends.push(n); }
      for (const svc of backends) { const t = nameToUid('Service', ns, svc); if (t) link(id, t, 'routes'); }
    }

    if (o.kind === 'Pod') {
      for (const v of spec?.volumes ?? []) {
        if (v.persistentVolumeClaim?.claimName) { const t = nameToUid('PersistentVolumeClaim', ns, v.persistentVolumeClaim.claimName); if (t) link(id, t, 'mounts'); }
        if (v.configMap?.name) { const t = nameToUid('ConfigMap', ns, v.configMap.name); if (t) link(id, t, 'uses'); }
        if (v.secret?.secretName) { const t = nameToUid('Secret', ns, v.secret.secretName); if (t) link(id, t, 'uses'); }
      }
      for (const cont of spec?.containers ?? []) {
        for (const ef of cont.envFrom ?? []) {
          if (ef.configMapRef?.name) { const t = nameToUid('ConfigMap', ns, ef.configMapRef.name); if (t) link(id, t, 'uses'); }
          if (ef.secretRef?.name) { const t = nameToUid('Secret', ns, ef.secretRef.name); if (t) link(id, t, 'uses'); }
        }
        for (const e of cont.env ?? []) {
          const cm = e.valueFrom?.configMapKeyRef?.name; if (cm) { const t = nameToUid('ConfigMap', ns, cm); if (t) link(id, t, 'uses'); }
          const sec = e.valueFrom?.secretKeyRef?.name; if (sec) { const t = nameToUid('Secret', ns, sec); if (t) link(id, t, 'uses'); }
        }
      }
    }
  }

  return { nodes, edges };
}
