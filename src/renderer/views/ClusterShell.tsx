import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ClusterStatus, ResourceCategory, ActionLogEntry } from '@shared/types';
import { useApp } from '../store';
import { useDescriptors } from '../kube/useDescriptors';
import { useWatch } from '../kube/useWatch';
import { ResourceTable } from '../components/ResourceTable';
import { DetailsDrawer } from '../components/DetailsDrawer';
import { Dock } from '../components/Dock';
import { ResourceMap } from '../components/map/ResourceMap';
import { HelmView } from '../components/helm/HelmView';
import { SavedClusters } from '../components/SavedClusters';

const CATEGORY_ORDER: ResourceCategory[] = ['Workloads', 'Config', 'Network', 'Storage', 'Access', 'Cluster'];

export function ClusterShell() {
  const session = useApp((s) => s.session)!;
  const activeResource = useApp((s) => s.activeResource);
  const setActiveResource = useApp((s) => s.setActiveResource);
  const namespace = useApp((s) => s.namespace);
  const setNamespace = useApp((s) => s.setNamespace);

  const descriptors = useDescriptors();
  const descriptor = descriptors.find((d) => d.id === activeResource);
  const [search, setSearch] = useState('');
  const [showLog, setShowLog] = useState(false);
  const [view, setView] = useState<'resources' | 'map' | 'helm'>('resources');

  const status = useQuery<ClusterStatus>({
    queryKey: ['status', session.id],
    queryFn: async () => { const r = await window.kn.cluster.status(session.id); if (!r.ok) throw new Error(r.error); return r.data; },
  });

  const ns = descriptor?.namespaced ? (namespace || undefined) : undefined;
  const { items, error, live } = useWatch(session.id, activeResource, ns);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? items.filter((o) => o.searchText().includes(q)) : items;
  }, [items, search]);

  const grouped = useMemo(() => CATEGORY_ORDER.map((cat) => ({ cat, items: descriptors.filter((d) => d.category === cat) })).filter((g) => g.items.length), [descriptors]);

  return (
    <div className="shell">
      {/* title bar */}
      <div className="titlebar">
        <span style={{ fontSize: 18 }}>🥷</span>
        <b style={{ letterSpacing: '.03em' }}>Kube<span style={{ color: 'var(--jade)' }}>Ninja</span></b>
        <ClusterSwitcher />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn sm" onClick={() => useApp.getState().setOverlay('cases')}>Cases</button>
          <button className="btn sm" onClick={() => useApp.getState().setOverlay('tools')}>Tools</button>
          <button className="btn sm" onClick={() => setShowLog(true)}>Action log</button>
        </div>
      </div>

      <div className="shell-main">
        {/* sidebar */}
        <div className="sidebar">
          <div className="side-group">
            <div className="side-cat">Cluster</div>
            <button className={'side-item' + (view === 'map' ? ' on' : '')} onClick={() => setView('map')}>◈ Resource map</button>
            <button className={'side-item' + (view === 'helm' ? ' on' : '')} onClick={() => setView('helm')}>⎈ Helm releases</button>
          </div>
          {grouped.map((g) => (
            <div key={g.cat} className="side-group">
              <div className="side-cat">{g.cat}</div>
              {g.items.map((d) => (
                <button key={d.id} className={'side-item' + (view === 'resources' && d.id === activeResource ? ' on' : '')} onClick={() => { setView('resources'); setActiveResource(d.id); }}>{d.kind}s</button>
              ))}
            </div>
          ))}
        </div>

        {/* content */}
        <div className="content">
          {view === 'map' && <ResourceMap />}
          {view === 'helm' && <HelmView />}
          {view === 'resources' && <>
            <div className="content-bar">
              <h2 style={{ fontSize: 15 }}>{descriptor?.kind ?? activeResource}s</h2>
              {descriptor?.namespaced && (
                <select className="input sm" style={{ width: 'auto' }} value={namespace} onChange={(e) => setNamespace(e.target.value)}>
                  <option value="">All namespaces</option>
                  {(status.data?.namespaces ?? []).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              )}
              <input className="input sm" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 240 }} />
              <span className="muted mono" style={{ marginLeft: 'auto', fontSize: 12 }}>
                {live ? `${filtered.length} shown` : 'connecting…'}{items.length !== filtered.length ? ` · ${items.length} total` : ''}
              </span>
            </div>

            {error && <div className="alert" style={{ margin: '0 12px 10px' }}>{error}</div>}
            {descriptor
              ? <div className="table-scroll"><ResourceTable descriptor={descriptor} items={filtered} /></div>
              : <div className="muted" style={{ padding: 20 }}>Loading resource kinds…</div>}

            <Dock />
          </>}
        </div>

        <DetailsDrawer />
      </div>

      {showLog && <ActionLogModal onClose={() => setShowLog(false)} cluster={session.name} />}
    </div>
  );
}

function ClusterSwitcher() {
  const sessions = useApp((s) => s.sessions);
  const session = useApp((s) => s.session)!;
  const switchCluster = useApp((s) => s.switchCluster);
  const removeSession = useApp((s) => s.removeSession);
  const setAddingCluster = useApp((s) => s.setAddingCluster);
  const [open, setOpen] = useState(false);

  const disconnect = async (id: string) => { await window.kn.cluster.disconnect(id); removeSession(id); };

  return (
    <div style={{ position: 'relative' }}>
      <button className="cluster-btn" onClick={() => setOpen((o) => !o)}>
        <span className="pill ok"><span className="d" /></span>
        <b>{session.name}</b>
        <span className="mono muted" style={{ fontSize: 11 }}>{session.region} · v{session.version}</span>
        {sessions.length > 1 && <span className="mono" style={{ fontSize: 10, color: 'var(--jade)' }}>+{sessions.length - 1}</span>}
        <span style={{ color: 'var(--dim)' }}>▾</span>
      </button>
      {open && (
        <>
          <div className="menu-backdrop" onClick={() => setOpen(false)} />
          <div className="menu" style={{ top: 34, left: 0, minWidth: 260 }}>
            <div className="lbl" style={{ padding: '4px 10px' }}>Connected clusters</div>
            {sessions.map((c) => (
              <div key={c.id} className={'cluster-row' + (c.id === session.id ? ' on' : '')}>
                <button className="cluster-pick" onClick={() => { switchCluster(c.id); setOpen(false); }}>
                  <span className={'pill ' + (c.id === session.id ? 'ok' : 'off')}><span className="d" /></span>
                  <span style={{ fontWeight: 600 }}>{c.name}</span>
                  <span className="mono muted" style={{ fontSize: 11, marginLeft: 'auto' }}>{c.region}</span>
                </button>
                <button className="cluster-x" title="Disconnect" onClick={() => { void disconnect(c.id); if (sessions.length === 1) setOpen(false); }}>✕</button>
              </div>
            ))}
            <div style={{ padding: '6px 10px 2px' }}>
              <SavedClusters compact hideConnected heading="Reconnect saved" onNeedCreds={() => { setOpen(false); setAddingCluster(true); }} />
            </div>
            <button className="menu-item" style={{ marginTop: 4, color: 'var(--jade)' }} onClick={() => { setOpen(false); setAddingCluster(true); }}>＋ Add cluster</button>
          </div>
        </>
      )}
    </div>
  );
}

function ActionLogModal({ onClose }: { onClose: () => void; cluster: string }) {
  const q = useQuery<ActionLogEntry[]>({
    queryKey: ['actionLog'],
    queryFn: async () => { const r = await window.kn.actionLog.list(); if (!r.ok) throw new Error(r.error); return r.data; },
  });
  return (
    <div className="overlay show" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width: 'min(680px, 100%)' }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="mhead"><b>Action log</b><button className="btn sm" style={{ marginLeft: 'auto' }} onClick={onClose}>✕</button></div>
        <div style={{ padding: '4px 6px', maxHeight: '60vh', overflow: 'auto' }}>
          {q.data?.length === 0 && <div className="muted" style={{ padding: 18, textAlign: 'center' }}>No actions recorded yet.</div>}
          {(q.data ?? []).map((e) => (
            <div key={e.id} className="logrow">
              <span className={'pill ' + (e.ok ? 'ok' : 'err')}><span className="d" />{e.verb}</span>
              <span className="mono" style={{ fontSize: 12 }}>{e.kind}/{e.name}{e.namespace ? ` · ${e.namespace}` : ''}{e.detail ? ` · ${e.detail}` : ''}</span>
              {e.error && <span className="muted" style={{ fontSize: 11, color: 'var(--danger)' }}>{e.error}</span>}
              <span className="mono muted" style={{ marginLeft: 'auto', fontSize: 11 }}>{new Date(e.ts).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
