import { useEffect, useState } from 'react';
import type { HelmRelease, HelmHistoryEntry } from '@shared/types';
import { useApp } from '../../store';
import { confirmDialog, promptDialog } from '../Dialog';
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

  const load = async () => {
    setLoading(true); setError(undefined);
    const r = await window.kn.helm.list(session.id);
    setLoading(false);
    if (r.ok) setReleases(r.data); else setError(r.error);
  };
  useEffect(() => {
    window.kn.helm.available().then((r) => { const ok = r.ok && r.data; setAvailable(!!ok); if (ok) load(); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const install = async () => {
    const name = await promptDialog({ title: 'Install a chart', label: 'Release name', okLabel: 'Next' });
    if (!name?.trim()) return;
    const chart = await promptDialog({ title: 'Install a chart', label: 'Chart (URL .tgz, OCI ref, or repo/chart)', initial: '', okLabel: 'Next' });
    if (!chart?.trim()) return;
    const ns = await promptDialog({ title: 'Install a chart', label: 'Namespace', initial: 'default', okLabel: 'Install' });
    if (!ns?.trim()) return;
    toast('Installing…');
    notifyResult(await window.kn.helm.install(session.id, name.trim(), ns.trim(), chart.trim()), 'Installed');
    load();
  };

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
        <button className="btn sm" onClick={load}>{loading ? 'Loading…' : 'Refresh'}</button>
        <button className="btn sm primary" onClick={install}>Install…</button>
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
          {selected ? <ReleaseDetail key={`${selected.namespace}/${selected.name}`} release={selected} onChanged={load} /> : <div className="muted" style={{ padding: 30, textAlign: 'center' }}>Select a release.</div>}
        </div>
      </div>
    </div>
  );
}

function ReleaseDetail({ release, onChanged }: { release: HelmRelease; onChanged: () => void }) {
  const session = useApp((s) => s.session)!;
  const [tab, setTab] = useState<'history' | 'values' | 'manifest'>('history');
  const [history, setHistory] = useState<HelmHistoryEntry[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const id = session.id, name = release.name, ns = release.namespace;

  useEffect(() => { window.kn.helm.history(id, name, ns).then((r) => { if (r.ok) setHistory(r.data); }); }, [id, name, ns]);
  useEffect(() => {
    if (tab === 'values') window.kn.helm.values(id, name, ns).then((r) => setText(r.ok ? r.data : r.error));
    if (tab === 'manifest') window.kn.helm.manifest(id, name, ns).then((r) => setText(r.ok ? r.data : r.error));
  }, [tab, id, name, ns]);

  const act = async (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => {
    setBusy(true); const r = await fn(); setBusy(false);
    notifyResult(r as never, ok); onChanged();
    window.kn.helm.history(id, name, ns).then((h) => { if (h.ok) setHistory(h.data); });
  };
  const rollback = async (rev: number) => {
    if (await confirmDialog({ title: 'Rollback release', message: <>Roll <b>{name}</b> back to revision <b>{rev}</b>?</>, okLabel: 'Rollback', danger: true }))
      act(() => window.kn.helm.rollback(id, name, ns, rev), 'Rolled back');
  };
  const upgrade = async () => {
    const chart = await promptDialog({ title: `Upgrade ${name}`, label: 'Chart (URL / OCI / repo/chart)', okLabel: 'Upgrade' });
    if (chart?.trim()) act(() => window.kn.helm.upgrade(id, name, ns, chart.trim()), 'Upgraded');
  };
  const uninstall = async () => {
    if (await confirmDialog({ title: 'Uninstall release', message: <>Uninstall <b>{name}</b> from <b>{ns}</b>? This removes all its resources.</>, okLabel: 'Uninstall', danger: true }))
      act(() => window.kn.helm.uninstall(id, name, ns), 'Uninstalled');
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
          <button className="btn sm" disabled={busy} onClick={upgrade}>Upgrade…</button>
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
