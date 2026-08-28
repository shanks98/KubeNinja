import { useEffect, useState } from 'react';
import type { HelmRelease, HelmHistoryEntry, HelmChart, HelmRepo, ClusterStatus } from '@shared/types';
import { useApp } from '../../store';
import { confirmDialog } from '../Dialog';
import { toast, notifyResult } from '../Toast';

function statusTone(s: string): 'ok' | 'warn' | 'err' | 'off' {
  return /deployed/i.test(s) ? 'ok' : /failed/i.test(s) ? 'err' : /pending|superseded/i.test(s) ? 'warn' : 'off';
}

export function HelmView() {
  const session = useApp((s) => s.session)!;
  const [available, setAvailable] = useState<boolean | null>(null);
  const [releases, setReleases] = useState<HelmRelease[]>([]);
  const [selected, setSelected] = useState<HelmRelease | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [ns, setNs] = useState('');
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [action, setAction] = useState<{ mode: 'install' | 'upgrade'; release?: HelmRelease } | null>(null);

  const load = async () => {
    setLoading(true); setError(undefined);
    const r = await window.kn.helm.list(session.id, ns || undefined);
    setLoading(false);
    if (r.ok) setReleases(r.data); else setError(r.error);
  };
  useEffect(() => {
    window.kn.cluster.status(session.id).then((r: { ok: boolean; data?: ClusterStatus }) => { if (r.ok && r.data) setNamespaces(r.data.namespaces); });
    window.kn.helm.available().then((r) => { const ok = r.ok && r.data; setAvailable(!!ok); if (ok) load(); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (available) load(); }, [ns]); // eslint-disable-line react-hooks/exhaustive-deps

  if (available === null) return <div className="muted" style={{ padding: 24 }}>Checking for helm…</div>;
  if (!available) return (
    <div style={{ padding: 30, maxWidth: 520 }}>
      <h2 style={{ fontSize: 15, marginBottom: 8 }}>Helm</h2>
      <div className="alert">The bundled <span className="mono">helm</span> binary was not found in this build. Helm actions are unavailable.</div>
    </div>
  );

  return (
    <div className="helmview">
      <div className="content-bar">
        <h2 style={{ fontSize: 15 }}>Helm releases</h2>
        <select className="input sm" style={{ width: 'auto' }} value={ns} onChange={(e) => setNs(e.target.value)}>
          <option value="">All namespaces</option>
          {namespaces.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <button className="btn sm" onClick={load}>{loading ? 'Loading…' : 'Refresh'}</button>
        <button className="btn sm primary" onClick={() => setAction({ mode: 'install' })}>Install…</button>
        <span className="muted mono" style={{ marginLeft: 'auto', fontSize: 12 }}>{releases.length} releases</span>
      </div>
      {error && <div className="alert" style={{ margin: '0 14px 8px' }}>{error}</div>}
      <div className="helm-main">
        <div className="helm-list">
          {releases.length === 0 && !loading && <div className="muted" style={{ padding: 14, fontSize: 12.5 }}>No releases.</div>}
          {releases.map((r) => (
            <button key={`${r.namespace}/${r.name}`} className={'helm-card' + (selected?.name === r.name && selected?.namespace === r.namespace ? ' on' : '')} onClick={() => setSelected(r)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={'pill ' + statusTone(r.status)}><span className="d" />{r.status}</span>
                <span className="muted mono" style={{ fontSize: 11, marginLeft: 'auto' }}>rev {r.revision}</span>
              </div>
              <div style={{ fontWeight: 600, margin: '6px 0 2px' }}>{r.name}</div>
              <div className="muted mono" style={{ fontSize: 11 }}>{r.namespace} · {r.chart}</div>
            </button>
          ))}
        </div>
        <div className="helm-detail">
          {selected ? <ReleaseDetail key={`${selected.namespace}/${selected.name}`} release={selected} onChanged={load} onUpgrade={() => setAction({ mode: 'upgrade', release: selected })} /> : <div className="muted" style={{ padding: 30, textAlign: 'center' }}>Select a release.</div>}
        </div>
      </div>
      {action && <HelmActionModal action={action} onClose={() => setAction(null)} onDone={load} />}
    </div>
  );
}

function HelmActionModal({ action, onClose, onDone }: { action: { mode: 'install' | 'upgrade'; release?: HelmRelease }; onClose: () => void; onDone: () => void }) {
  const session = useApp((s) => s.session)!;
  const upgrade = action.mode === 'upgrade';
  const [name, setName] = useState(action.release?.name ?? '');
  const [ns, setNs] = useState(action.release?.namespace ?? 'default');
  const [chart, setChart] = useState('');
  const [version, setVersion] = useState('');
  const [values, setValues] = useState('');
  const [busy, setBusy] = useState(false);
  const [repos, setRepos] = useState<HelmRepo[]>([]);
  const [repoName, setRepoName] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<HelmChart[] | null>(null);
  const [searching, setSearching] = useState(false);

  const loadRepos = () => window.kn.helm.repoList().then((r) => { if (r.ok) setRepos(r.data); });
  useEffect(() => { loadRepos(); }, []);

  const addRepo = async () => {
    if (!repoName.trim() || !repoUrl.trim()) return;
    const r = await window.kn.helm.repoAdd(repoName.trim(), repoUrl.trim());
    if (r.ok) { setRepoName(''); setRepoUrl(''); loadRepos(); toast('Repo added'); } else toast(r.error);
  };
  const search = async () => {
    setSearching(true); const r = await window.kn.helm.search(term.trim()); setSearching(false);
    setResults(r.ok ? r.data : []); if (!r.ok) toast(r.error);
  };
  const submit = async () => {
    if (!name.trim() || !chart.trim()) return;
    setBusy(true);
    const r = upgrade
      ? await window.kn.helm.upgrade(session.id, name.trim(), ns.trim(), chart.trim(), version.trim() || undefined, values || undefined)
      : await window.kn.helm.install(session.id, name.trim(), ns.trim(), chart.trim(), version.trim() || undefined, values || undefined);
    setBusy(false);
    notifyResult(r, upgrade ? 'Upgraded' : 'Installed');
    if (r.ok) { onDone(); onClose(); }
  };

  return (
    <div className="overlay show" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width: 'min(640px, 100%)' }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="mhead"><b>{upgrade ? `Upgrade ${name}` : 'Install a chart'}</b><button className="btn sm" style={{ marginLeft: 'auto' }} onClick={onClose}>✕</button></div>
        <div style={{ padding: '14px 18px', maxHeight: '76vh', overflow: 'auto' }}>
          <div className="split" style={{ marginBottom: 10 }}>
            <label><div className="lbl" style={{ marginBottom: 4 }}>Release name</div><input className="input sm" value={name} disabled={upgrade} onChange={(e) => setName(e.target.value)} /></label>
            <label><div className="lbl" style={{ marginBottom: 4 }}>Namespace</div><input className="input sm" value={ns} disabled={upgrade} onChange={(e) => setNs(e.target.value)} /></label>
          </div>
          <div className="split" style={{ marginBottom: 10 }}>
            <label><div className="lbl" style={{ marginBottom: 4 }}>Chart (repo/chart, URL .tgz, or OCI)</div><input className="input sm mono" value={chart} onChange={(e) => setChart(e.target.value)} placeholder="bitnami/redis" /></label>
            <label style={{ maxWidth: 160 }}><div className="lbl" style={{ marginBottom: 4 }}>Version</div><input className="input sm mono" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="latest" /></label>
          </div>

          <div className="lbl" style={{ margin: '10px 0 5px' }}>Values (YAML, optional)</div>
          <textarea className="input mono" style={{ minHeight: 90, fontSize: 12 }} value={values} onChange={(e) => setValues(e.target.value)} placeholder={'replicaCount: 2\nservice:\n  type: LoadBalancer'} />

          <details style={{ marginTop: 12 }}>
            <summary className="lbl" style={{ cursor: 'pointer' }}>Repositories &amp; chart search</summary>
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input className="input sm" placeholder="repo name" value={repoName} onChange={(e) => setRepoName(e.target.value)} style={{ maxWidth: 130 }} />
                <input className="input sm mono" placeholder="https://charts.example.com" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} />
                <button className="btn sm" onClick={addRepo}>Add repo</button>
              </div>
              <div className="chips" style={{ marginBottom: 8 }}>{repos.map((r) => <span key={r.name} className="chip" title={r.url}>{r.name}</span>)}{repos.length === 0 && <span className="muted" style={{ fontSize: 11 }}>No repos added.</span>}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input sm" placeholder="search charts…" value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') search(); }} />
                <button className="btn sm" disabled={searching} onClick={search}>{searching ? 'Searching…' : 'Search'}</button>
              </div>
              {results && (
                <div style={{ maxHeight: 180, overflow: 'auto', marginTop: 8 }}>
                  {results.length === 0 && <div className="muted" style={{ fontSize: 12 }}>No charts (add a repo first).</div>}
                  {results.slice(0, 40).map((c, i) => (
                    <button key={i} className="btn" style={{ width: '100%', textAlign: 'left', marginBottom: 5, display: 'flex', gap: 8, alignItems: 'center' }} onClick={() => { setChart(c.name); setVersion(c.version); }}>
                      <span className="mono" style={{ fontWeight: 600 }}>{c.name}</span>
                      <span className="muted mono" style={{ fontSize: 11 }}>{c.version} · app {c.appVersion}</span>
                      <span className="muted" style={{ fontSize: 11, marginLeft: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{c.description}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </details>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <button className="btn sm" onClick={onClose}>Cancel</button>
            <button className="btn sm primary" disabled={!name.trim() || !chart.trim() || busy} onClick={submit}>{busy ? (upgrade ? 'Upgrading…' : 'Installing…') : (upgrade ? 'Upgrade' : 'Install')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReleaseDetail({ release, onChanged, onUpgrade }: { release: HelmRelease; onChanged: () => void; onUpgrade: () => void }) {
  const session = useApp((s) => s.session)!;
  const [tab, setTab] = useState<'history' | 'values' | 'manifest'>('history');
  const [history, setHistory] = useState<HelmHistoryEntry[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const id = session.id, name = release.name, ns = release.namespace;

  const loadHistory = () => window.kn.helm.history(id, name, ns).then((r) => { if (r.ok) setHistory(r.data); });
  useEffect(() => { loadHistory(); }, [id, name, ns]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (tab === 'values') window.kn.helm.values(id, name, ns).then((r) => setText(r.ok ? r.data : r.error));
    if (tab === 'manifest') window.kn.helm.manifest(id, name, ns).then((r) => setText(r.ok ? r.data : r.error));
  }, [tab, id, name, ns]);

  const rollback = async (rev: number) => {
    if (await confirmDialog({ title: 'Rollback release', message: <>Roll <b>{name}</b> back to revision <b>{rev}</b>?</>, okLabel: 'Rollback', danger: true })) {
      setBusy(true); const r = await window.kn.helm.rollback(id, name, ns, rev); setBusy(false);
      notifyResult(r, 'Rolled back'); onChanged(); loadHistory();
    }
  };
  const uninstall = async () => {
    if (await confirmDialog({ title: 'Uninstall release', message: <>Uninstall <b>{name}</b> from <b>{ns}</b>? This removes all its resources.</>, okLabel: 'Uninstall', danger: true })) {
      setBusy(true); const r = await window.kn.helm.uninstall(id, name, ns); setBusy(false);
      notifyResult(r, 'Uninstalled'); onChanged();
    }
  };

  return (
    <div className="cd">
      <div className="cd-head">
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={'pill ' + statusTone(release.status)}><span className="d" />{release.status}</span>
            <h2 style={{ fontSize: 17 }}>{name}</h2>
          </div>
          <div className="muted mono" style={{ fontSize: 12, marginTop: 3 }}>{ns} · {release.chart} · app {release.appVersion || '—'} · rev {release.revision}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn sm" disabled={busy} onClick={onUpgrade}>Upgrade…</button>
          <button className="btn sm danger" disabled={busy} onClick={uninstall}>Uninstall</button>
        </div>
      </div>
      <div className="drawer-tabs" style={{ padding: '0 16px' }}>
        {(['history', 'values', 'manifest'] as const).map((t) => <button key={t} className={'dtab' + (t === tab ? ' on' : '')} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}
      </div>
      <div className="cd-body">
        {tab === 'history' && (
          <table className="har-table"><thead><tr><th>Rev</th><th>Updated</th><th>Status</th><th>Chart</th><th>Description</th><th></th></tr></thead>
            <tbody>{history.map((h) => (
              <tr key={h.revision}>
                <td className="mono">{h.revision}</td><td className="muted mono" style={{ fontSize: 11 }}>{new Date(h.updated).toLocaleString()}</td>
                <td><span className={'pill ' + statusTone(h.status)}><span className="d" />{h.status}</span></td>
                <td className="mono">{h.chart}</td><td className="muted" style={{ fontSize: 12 }}>{h.description}</td>
                <td>{h.revision !== release.revision && <button className="btn sm" disabled={busy} onClick={() => rollback(h.revision)}>Rollback</button>}</td>
              </tr>
            ))}{history.length === 0 && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 18 }}>No history.</td></tr>}</tbody>
          </table>
        )}
        {(tab === 'values' || tab === 'manifest') && <pre className="tool-out" style={{ flex: 1, maxHeight: 'none' }}>{text || '—'}</pre>}
      </div>
    </div>
  );
}
