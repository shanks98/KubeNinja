import { useState, type ReactNode } from 'react';
import type { RawKubeObject } from '@shared/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
const spec = (o: RawKubeObject) => (o.spec ?? {}) as any;
const status = (o: RawKubeObject) => (o.status ?? {}) as any;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <div style={{ marginTop: 14 }}><div className="lbl" style={{ marginBottom: 6 }}>{title}</div>{children}</div>;
}
function KV({ rows }: { rows: [string, ReactNode][] }) {
  return <div className="kv">{rows.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => (
    <div key={k} style={{ display: 'contents' }}><div className="k">{k}</div><div className="mono">{v}</div></div>
  ))}</div>;
}

/** Per-kind detail sections shown under the drawer Overview. */
export function KindDetails({ obj, resourceId }: { obj: RawKubeObject; resourceId: string }) {
  switch (resourceId) {
    case 'pods': return <PodDetails o={obj} />;
    case 'deployments': case 'statefulsets': case 'replicasets': case 'daemonsets': return <WorkloadDetails o={obj} />;
    case 'services': return <ServiceDetails o={obj} />;
    case 'ingresses': return <IngressDetails o={obj} />;
    case 'configmaps': return <DataDetails o={obj} secret={false} />;
    case 'secrets': return <DataDetails o={obj} secret />;
    case 'persistentvolumeclaims': return <PvcDetails o={obj} />;
    case 'nodes': return <NodeDetails o={obj} />;
    default: return null;
  }
}

function PodDetails({ o }: { o: RawKubeObject }) {
  const s = spec(o), st = status(o);
  const csByName: Record<string, any> = {};
  for (const cs of st.containerStatuses ?? []) csByName[cs.name] = cs;
  const containers = [...(s.initContainers ?? []).map((c: any) => ({ ...c, init: true })), ...(s.containers ?? [])];
  const stateOf = (cs: any) => cs ? (cs.state?.running ? 'Running' : cs.state?.waiting?.reason ?? cs.state?.terminated?.reason ?? '?') : '—';
  return (
    <>
      <Section title="Pod">
        <KV rows={[['Node', s.nodeName], ['Pod IP', st.podIP], ['QoS', st.qosClass], ['Service account', s.serviceAccountName], ['Restart policy', s.restartPolicy]]} />
      </Section>
      <Section title={`Containers (${containers.length})`}>
        <table className="har-table"><thead><tr><th>Name</th><th>Image</th><th>Ready</th><th>Restarts</th><th>State</th></tr></thead>
          <tbody>{containers.map((c: any) => { const cs = csByName[c.name]; return (
            <tr key={c.name}><td className="mono">{c.name}{c.init ? <span className="muted"> (init)</span> : ''}</td>
              <td className="mono muted" style={{ fontSize: 11 }}>{c.image}</td>
              <td>{cs?.ready ? '✓' : '✗'}</td><td className="mono">{cs?.restartCount ?? 0}</td>
              <td className="mono" style={{ color: /CrashLoop|Error|BackOff/.test(stateOf(cs)) ? 'var(--danger)' : undefined }}>{stateOf(cs)}</td></tr>
          ); })}</tbody></table>
      </Section>
      {(s.volumes ?? []).length > 0 && <Section title="Volumes">
        <div className="chips">{s.volumes.map((v: any) => <span key={v.name} className="chip">{v.name}: {v.persistentVolumeClaim ? `pvc/${v.persistentVolumeClaim.claimName}` : v.configMap ? `cm/${v.configMap.name}` : v.secret ? `secret/${v.secret.secretName}` : Object.keys(v).filter((k) => k !== 'name')[0]}</span>)}</div>
      </Section>}
    </>
  );
}

function WorkloadDetails({ o }: { o: RawKubeObject }) {
  const s = spec(o), st = status(o);
  const images = (s.template?.spec?.containers ?? []).map((c: any) => c.image);
  return (
    <>
      <Section title="Rollout">
        <KV rows={[
          ['Replicas', `${st.readyReplicas ?? st.numberReady ?? 0} ready / ${s.replicas ?? st.desiredNumberScheduled ?? '?'} desired`],
          ['Updated', st.updatedReplicas], ['Available', st.availableReplicas],
          ['Strategy', s.strategy?.type ?? s.updateStrategy?.type],
          ['Selector', s.selector?.matchLabels ? Object.entries(s.selector.matchLabels).map(([k, v]) => `${k}=${v}`).join(', ') : undefined],
        ]} />
      </Section>
      {images.length > 0 && <Section title="Images"><div className="chips">{images.map((i: string, k: number) => <span key={k} className="chip">{i}</span>)}</div></Section>}
    </>
  );
}

function ServiceDetails({ o }: { o: RawKubeObject }) {
  const s = spec(o);
  return (
    <>
      <Section title="Service">
        <KV rows={[['Type', s.type ?? 'ClusterIP'], ['Cluster IP', s.clusterIP], ['External IPs', (s.externalIPs ?? []).join(', ')],
          ['Session affinity', s.sessionAffinity], ['Selector', s.selector ? Object.entries(s.selector).map(([k, v]) => `${k}=${v}`).join(', ') : undefined]]} />
      </Section>
      <Section title="Ports">
        <table className="har-table"><thead><tr><th>Name</th><th>Port</th><th>Target</th><th>Node</th><th>Proto</th></tr></thead>
          <tbody>{(s.ports ?? []).map((p: any, i: number) => <tr key={i}><td className="mono">{p.name ?? '—'}</td><td className="mono">{p.port}</td><td className="mono">{p.targetPort}</td><td className="mono">{p.nodePort ?? '—'}</td><td>{p.protocol ?? 'TCP'}</td></tr>)}</tbody></table>
      </Section>
    </>
  );
}

function IngressDetails({ o }: { o: RawKubeObject }) {
  const s = spec(o);
  const tlsHosts = (s.tls ?? []).flatMap((t: any) => t.hosts ?? []);
  return (
    <Section title="Rules">
      <table className="har-table"><thead><tr><th>Host</th><th>Path</th><th>Backend</th><th>TLS</th></tr></thead>
        <tbody>{(s.rules ?? []).flatMap((r: any, ri: number) => (r.http?.paths ?? [{}]).map((p: any, pi: number) => (
          <tr key={`${ri}-${pi}`}><td className="mono">{r.host ?? '*'}</td><td className="mono">{p.path ?? '/'}</td>
            <td className="mono">{p.backend?.service ? `${p.backend.service.name}:${p.backend.service.port?.number ?? p.backend.service.port?.name ?? ''}` : ''}</td>
            <td>{tlsHosts.includes(r.host) ? '🔒' : ''}</td></tr>
        )))}</tbody></table>
    </Section>
  );
}

function DataDetails({ o, secret }: { o: RawKubeObject; secret: boolean }) {
  const data = (secret ? (o.data as any) : (o.data as any)) ?? {};
  const keys = Object.keys(data);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const toggle = (k: string) => setRevealed((r) => { const n = new Set(r); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const decode = (v: string) => { try { return decodeURIComponent(escape(atob(v))); } catch { return atob(v); } };
  return (
    <>
      {secret && <Section title="Type"><span className="mono" style={{ fontSize: 12 }}>{o.type ?? 'Opaque'}</span></Section>}
      <Section title={`Data (${keys.length} keys)`}>
        {keys.length === 0 && <div className="muted" style={{ fontSize: 12 }}>No data.</div>}
        {keys.map((k) => (
          <div key={k} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="mono" style={{ fontWeight: 600, fontSize: 12 }}>{k}</span>
              {secret && <button className="btn sm" onClick={() => toggle(k)}>{revealed.has(k) ? 'Hide' : 'Reveal'}</button>}
            </div>
            <pre className="evtext" style={{ maxHeight: 160 }}>{secret ? (revealed.has(k) ? decode(String(data[k])) : '•••••••• (base64, click Reveal)') : String(data[k])}</pre>
          </div>
        ))}
      </Section>
    </>
  );
}

function PvcDetails({ o }: { o: RawKubeObject }) {
  const s = spec(o), st = status(o);
  return <Section title="Claim"><KV rows={[['Status', st.phase], ['Capacity', st.capacity?.storage], ['Storage class', s.storageClassName],
    ['Volume', s.volumeName], ['Access modes', (s.accessModes ?? []).join(', ')], ['Volume mode', s.volumeMode]]} /></Section>;
}

function NodeDetails({ o }: { o: RawKubeObject }) {
  const s = spec(o), st = status(o);
  const info = st.nodeInfo ?? {};
  const conds = (st.conditions ?? []) as any[];
  return (
    <>
      <Section title="Node">
        <KV rows={[['Kubelet', info.kubeletVersion], ['OS', `${info.operatingSystem ?? ''} ${info.osImage ?? ''}`], ['Kernel', info.kernelVersion],
          ['Runtime', info.containerRuntimeVersion], ['Unschedulable', s.unschedulable ? 'yes' : 'no'],
          ['Addresses', (st.addresses ?? []).map((a: any) => `${a.type}:${a.address}`).join(', ')]]} />
      </Section>
      <Section title="Capacity">
        <KV rows={[['CPU', `${st.allocatable?.cpu ?? '?'} / ${st.capacity?.cpu ?? '?'}`], ['Memory', `${st.allocatable?.memory ?? '?'} / ${st.capacity?.memory ?? '?'}`], ['Pods', `${st.allocatable?.pods ?? '?'} / ${st.capacity?.pods ?? '?'}`]]} />
      </Section>
      <Section title="Conditions">
        <div className="chips">{conds.map((c, i) => <span key={i} className={'pill ' + (c.type === 'Ready' ? (c.status === 'True' ? 'ok' : 'err') : (c.status === 'True' ? 'warn' : 'off'))}><span className="d" />{c.type}</span>)}</div>
      </Section>
    </>
  );
}
