import type { ReactNode } from 'react';
import { KubeObject } from './KubeObject';

export interface Column {
  id: string;
  title: string;
  /** CSS grid track width, e.g. "1fr" | "120px". Name gets the flexible track. */
  width: string;
  value(o: KubeObject): ReactNode;
  sort?(o: KubeObject): string | number;
  mono?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function raw(o: KubeObject): any { return o.raw; }

type Tone = 'ok' | 'warn' | 'err' | 'off';
export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`pill ${tone}`}><span className="d" />{children}</span>;
}

const AGE: Column = { id: 'age', title: 'Age', width: '70px', mono: true, value: (o) => o.getAge(), sort: (o) => -o.getAgeSeconds() };
const NAMESPACE: Column = { id: 'namespace', title: 'Namespace', width: '160px', mono: true, value: (o) => o.getNs() ?? '', sort: (o) => o.getNs() ?? '' };
const NAME: Column = { id: 'name', title: 'Name', width: 'minmax(220px, 2fr)', mono: true, value: (o) => o.getName(), sort: (o) => o.getName() };

function podPhase(o: KubeObject): { text: string; tone: Tone } {
  const st = raw(o).status ?? {};
  const cs: any[] = st.containerStatuses ?? [];
  const waiting = cs.map((c) => c.state?.waiting?.reason).find(Boolean);
  const terminated = cs.map((c) => c.state?.terminated?.reason).find((r: string) => r && r !== 'Completed');
  const text = waiting || terminated || st.reason || st.phase || 'Unknown';
  const bad = /CrashLoopBackOff|Error|ImagePullBackOff|ErrImagePull|Failed|Evicted|OOMKilled/.test(text);
  const tone: Tone = bad ? 'err' : text === 'Running' || text === 'Succeeded' || text === 'Completed' ? 'ok' : text === 'Pending' ? 'warn' : 'off';
  return { text, tone };
}

function ready(cur?: number, want?: number): string { return `${cur ?? 0}/${want ?? 0}`; }

const COLUMNS: Record<string, Column[]> = {
  pods: [
    NAME, NAMESPACE,
    { id: 'ready', title: 'Ready', width: '70px', mono: true, value: (o) => {
      const cs: any[] = raw(o).status?.containerStatuses ?? [];
      return ready(cs.filter((c) => c.ready).length, cs.length || (raw(o).spec?.containers?.length ?? 0));
    } },
    { id: 'status', title: 'Status', width: '150px', value: (o) => { const p = podPhase(o); return <Pill tone={p.tone}>{p.text}</Pill>; }, sort: (o) => podPhase(o).text },
    { id: 'restarts', title: 'Restarts', width: '90px', mono: true, value: (o) => {
      const cs: any[] = raw(o).status?.containerStatuses ?? [];
      return cs.reduce((n, c) => n + (c.restartCount ?? 0), 0);
    }, sort: (o) => (raw(o).status?.containerStatuses ?? []).reduce((n: number, c: any) => n + (c.restartCount ?? 0), 0) },
    { id: 'node', title: 'Node', width: '160px', mono: true, value: (o) => raw(o).spec?.nodeName ?? '' },
    AGE,
  ],
  deployments: [
    NAME, NAMESPACE,
    { id: 'ready', title: 'Ready', width: '90px', mono: true, value: (o) => ready(raw(o).status?.readyReplicas, raw(o).spec?.replicas) },
    { id: 'uptodate', title: 'Up-to-date', width: '100px', mono: true, value: (o) => raw(o).status?.updatedReplicas ?? 0 },
    { id: 'available', title: 'Available', width: '90px', mono: true, value: (o) => raw(o).status?.availableReplicas ?? 0 },
    AGE,
  ],
  statefulsets: [
    NAME, NAMESPACE,
    { id: 'ready', title: 'Ready', width: '90px', mono: true, value: (o) => ready(raw(o).status?.readyReplicas, raw(o).spec?.replicas) },
    AGE,
  ],
  daemonsets: [
    NAME, NAMESPACE,
    { id: 'desired', title: 'Desired', width: '80px', mono: true, value: (o) => raw(o).status?.desiredNumberScheduled ?? 0 },
    { id: 'current', title: 'Current', width: '80px', mono: true, value: (o) => raw(o).status?.currentNumberScheduled ?? 0 },
    { id: 'ready', title: 'Ready', width: '70px', mono: true, value: (o) => raw(o).status?.numberReady ?? 0 },
    AGE,
  ],
  replicasets: [
    NAME, NAMESPACE,
    { id: 'desired', title: 'Desired', width: '80px', mono: true, value: (o) => raw(o).spec?.replicas ?? 0 },
    { id: 'current', title: 'Current', width: '80px', mono: true, value: (o) => raw(o).status?.replicas ?? 0 },
    { id: 'ready', title: 'Ready', width: '70px', mono: true, value: (o) => raw(o).status?.readyReplicas ?? 0 },
    AGE,
  ],
  jobs: [
    NAME, NAMESPACE,
    { id: 'completions', title: 'Completions', width: '110px', mono: true, value: (o) => ready(raw(o).status?.succeeded, raw(o).spec?.completions ?? 1) },
    AGE,
  ],
  cronjobs: [
    NAME, NAMESPACE,
    { id: 'schedule', title: 'Schedule', width: '140px', mono: true, value: (o) => raw(o).spec?.schedule ?? '' },
    { id: 'suspend', title: 'Suspend', width: '80px', value: (o) => (raw(o).spec?.suspend ? <Pill tone="warn">Yes</Pill> : 'No') },
    { id: 'active', title: 'Active', width: '70px', mono: true, value: (o) => (raw(o).status?.active?.length ?? 0) },
    AGE,
  ],
  services: [
    NAME, NAMESPACE,
    { id: 'type', title: 'Type', width: '110px', value: (o) => raw(o).spec?.type ?? 'ClusterIP' },
    { id: 'clusterip', title: 'Cluster IP', width: '130px', mono: true, value: (o) => raw(o).spec?.clusterIP ?? '' },
    { id: 'ports', title: 'Ports', width: '150px', mono: true, value: (o) => (raw(o).spec?.ports ?? []).map((p: any) => `${p.port}${p.nodePort ? ':' + p.nodePort : ''}/${p.protocol ?? 'TCP'}`).join(', ') },
    AGE,
  ],
  ingresses: [
    NAME, NAMESPACE,
    { id: 'hosts', title: 'Hosts', width: '2fr', mono: true, value: (o) => (raw(o).spec?.rules ?? []).map((r: any) => r.host).filter(Boolean).join(', ') || '*' },
    AGE,
  ],
  configmaps: [
    NAME, NAMESPACE,
    { id: 'keys', title: 'Keys', width: '2fr', mono: true, value: (o) => Object.keys(raw(o).data ?? {}).join(', ') },
    AGE,
  ],
  secrets: [
    NAME, NAMESPACE,
    { id: 'type', title: 'Type', width: '220px', mono: true, value: (o) => raw(o).type ?? 'Opaque' },
    { id: 'keys', title: 'Keys', width: '80px', mono: true, value: (o) => Object.keys(raw(o).data ?? {}).length },
    AGE,
  ],
  persistentvolumeclaims: [
    NAME, NAMESPACE,
    { id: 'status', title: 'Status', width: '110px', value: (o) => { const s = raw(o).status?.phase ?? ''; return <Pill tone={s === 'Bound' ? 'ok' : 'warn'}>{s}</Pill>; } },
    { id: 'capacity', title: 'Capacity', width: '90px', mono: true, value: (o) => raw(o).status?.capacity?.storage ?? '' },
    { id: 'sc', title: 'Storage class', width: '150px', mono: true, value: (o) => raw(o).spec?.storageClassName ?? '' },
    AGE,
  ],
  persistentvolumes: [
    NAME,
    { id: 'capacity', title: 'Capacity', width: '90px', mono: true, value: (o) => raw(o).spec?.capacity?.storage ?? '' },
    { id: 'status', title: 'Status', width: '110px', value: (o) => { const s = raw(o).status?.phase ?? ''; return <Pill tone={s === 'Bound' ? 'ok' : 'warn'}>{s}</Pill>; } },
    { id: 'claim', title: 'Claim', width: '2fr', mono: true, value: (o) => { const c = raw(o).spec?.claimRef; return c ? `${c.namespace}/${c.name}` : ''; } },
    AGE,
  ],
  storageclasses: [
    NAME,
    { id: 'provisioner', title: 'Provisioner', width: '2fr', mono: true, value: (o) => raw(o).provisioner ?? '' },
    AGE,
  ],
  nodes: [
    NAME,
    { id: 'status', title: 'Status', width: '120px', value: (o) => {
      const conds: any[] = raw(o).status?.conditions ?? [];
      const ready = conds.find((c) => c.type === 'Ready');
      const sched = raw(o).spec?.unschedulable;
      if (sched) return <Pill tone="warn">SchedulingDisabled</Pill>;
      return <Pill tone={ready?.status === 'True' ? 'ok' : 'err'}>{ready?.status === 'True' ? 'Ready' : 'NotReady'}</Pill>;
    } },
    { id: 'roles', title: 'Roles', width: '140px', mono: true, value: (o) => Object.keys(o.getLabels()).filter((k) => k.startsWith('node-role.kubernetes.io/')).map((k) => k.split('/')[1]).join(', ') || '<none>' },
    { id: 'version', title: 'Version', width: '120px', mono: true, value: (o) => raw(o).status?.nodeInfo?.kubeletVersion ?? '' },
    AGE,
  ],
  namespaces: [
    NAME,
    { id: 'status', title: 'Status', width: '120px', value: (o) => { const s = raw(o).status?.phase ?? ''; return <Pill tone={s === 'Active' ? 'ok' : 'warn'}>{s}</Pill>; } },
    AGE,
  ],
  events: [
    { id: 'type', title: 'Type', width: '90px', value: (o) => { const t = raw(o).type ?? ''; return <Pill tone={t === 'Warning' ? 'warn' : 'off'}>{t}</Pill>; } },
    { id: 'reason', title: 'Reason', width: '160px', mono: true, value: (o) => raw(o).reason ?? '' },
    { id: 'object', title: 'Object', width: '200px', mono: true, value: (o) => { const io = raw(o).involvedObject; return io ? `${io.kind}/${io.name}` : ''; } },
    { id: 'message', title: 'Message', width: '2fr', value: (o) => raw(o).message ?? '' },
    NAMESPACE,
    AGE,
  ],
};

const DEFAULT_NS: Column[] = [NAME, NAMESPACE, AGE];
const DEFAULT_CLUSTER: Column[] = [NAME, AGE];

export function columnsFor(resourceId: string, namespaced: boolean): Column[] {
  return COLUMNS[resourceId] ?? (namespaced ? DEFAULT_NS : DEFAULT_CLUSTER);
}
