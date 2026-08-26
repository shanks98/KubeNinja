import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApp } from '../store';
import type { ClusterStatus, PodRow } from '@shared/types';

export function ClusterShell() {
  const session = useApp((s) => s.session)!;
  const setSession = useApp((s) => s.setSession);
  const [ns, setNs] = useState('default');

  const status = useQuery<ClusterStatus>({
    queryKey: ['status', session.id],
    queryFn: async () => {
      const r = await window.kn.cluster.status(session.id);
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
  });

  const pods = useQuery<PodRow[]>({
    queryKey: ['pods', session.id, ns],
    queryFn: async () => {
      const r = await window.kn.cluster.listPods(session.id, ns);
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
    enabled: !!ns,
  });

  const disconnect = async () => {
    await window.kn.cluster.disconnect(session.id);
    setSession(null);
  };

  const namespaces = status.data?.namespaces ?? ['default'];

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* title bar */}
      <div style={{ height: 40, display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(180deg,#0e1119,#0a0c11)' }}>
        <span style={{ fontSize: 18 }}>🥷</span>
        <b style={{ letterSpacing: '.03em' }}>Kube<span style={{ color: 'var(--jade)' }}>Ninja</span></b>
        <span className="pill ok" style={{ marginLeft: 8 }}><span className="d" />Connected</span>
        <span className="mono muted" style={{ fontSize: 12 }}>{session.name} · {session.region} · v{session.version}</span>
        <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={disconnect}>Disconnect</button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 18 }}>
        {status.isError && <div className="alert" style={{ marginBottom: 14 }}>Cluster unreachable: {(status.error as Error).message}</div>}

        {/* status strip */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
          {[['Kubernetes', status.data?.version ?? '…'], ['Nodes', status.data?.nodeCount ?? '…'], ['Namespaces', status.data?.namespaceCount ?? '…']].map(([k, v]) => (
            <div key={k} className="card" style={{ flex: 1, padding: '13px 16px' }}>
              <div className="lbl">{k}</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 3 }} className="mono">{String(v)}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <h2 style={{ fontSize: 15 }}>Pods</h2>
          <select className="input" style={{ width: 'auto', padding: '5px 9px' }} value={ns} onChange={(e) => setNs(e.target.value)}>
            {namespaces.map((n) => <option key={n}>{n}</option>)}
          </select>
          <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>
            {pods.isFetching ? 'loading…' : `${pods.data?.length ?? 0} pods`}
          </span>
        </div>

        {pods.isError && <div className="alert">{(pods.error as Error).message}</div>}
        <table>
          <thead><tr><th>Name</th><th>Ready</th><th>Phase</th><th>Restarts</th><th>Node</th><th>Age</th></tr></thead>
          <tbody>
            {(pods.data ?? []).map((p) => (
              <tr key={p.name}>
                <td className="mono" style={{ fontWeight: 600 }}>{p.name}</td>
                <td className="mono">{p.ready}</td>
                <td><span className={'pill ' + (p.phase === 'Running' ? 'ok' : p.phase === 'Pending' ? 'warn' : 'err')}><span className="d" />{p.phase}</span></td>
                <td className="mono" style={{ color: p.restarts > 5 ? 'var(--danger)' : undefined, fontWeight: p.restarts > 5 ? 700 : 400 }}>{p.restarts}</td>
                <td className="mono muted">{p.node}</td>
                <td className="mono muted">{p.age}</td>
              </tr>
            ))}
            {pods.data?.length === 0 && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 22 }}>No pods in {ns}.</td></tr>}
          </tbody>
        </table>

        <p className="muted" style={{ fontSize: 11.5, marginTop: 16 }}>
          Slice 0 — connect + status + pods. Next: full resource browser, logs/live/trace, exec, actions.
        </p>
      </div>
    </div>
  );
}
