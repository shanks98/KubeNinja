import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dump as dumpYaml } from 'js-yaml';
import type { RawKubeObject } from '@shared/types';
import { useApp } from '../store';
import { KubeObject } from '../kube/KubeObject';
import { YamlEditor } from './YamlEditor';
import { toast } from './Toast';
import { pinEvidence } from './cases/pin';
import { KindDetails } from './KindDetails';

function cleanForYaml(obj: RawKubeObject): RawKubeObject {
  const c = structuredClone(obj);
  if (c.metadata) delete (c.metadata as Record<string, unknown>).managedFields;
  return c;
}

export function DetailsDrawer() {
  const details = useApp((s) => s.details);
  const setDetails = useApp((s) => s.setDetails);
  const session = useApp((s) => s.session)!;
  const [tab, setTab] = useState<'overview' | 'yaml' | 'events'>('overview');
  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const [applying, setApplying] = useState(false);

  const q = useQuery({
    enabled: !!details,
    queryKey: ['obj', details?.uid],
    queryFn: async () => {
      const r = await window.kn.kube.get(session.id, details!.resourceId, details!.namespace, details!.name);
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
  });
  const events = useQuery({
    enabled: !!details && tab === 'events',
    queryKey: ['ev', details?.uid],
    queryFn: async () => {
      const r = await window.kn.kube.events(session.id, details!.namespace, details!.uid);
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
  });

  useEffect(() => { setTab('overview'); }, [details?.uid]);
  useEffect(() => {
    if (q.data) { setDraft(dumpYaml(cleanForYaml(q.data), { noRefs: true, lineWidth: -1 })); setDirty(false); }
  }, [q.data]);

  if (!details) return null;
  const obj = q.data ? new KubeObject(q.data) : null;

  const apply = async () => {
    setApplying(true);
    const r = await window.kn.kube.apply(session.id, draft);
    setApplying(false);
    if (r.ok) { toast('Applied'); setDirty(false); q.refetch(); } else toast(r.error);
  };

  return (
    <div className="drawer">
      <div className="drawer-head">
        <div style={{ minWidth: 0 }}>
          <div className="lbl">{details.resourceId}</div>
          <div className="mono" style={{ fontWeight: 650, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis' }}>{details.name}</div>
        </div>
        <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setDetails(null)}>✕</button>
      </div>

      <div className="drawer-tabs">
        {(['overview', 'yaml', 'events'] as const).map((t) => (
          <button key={t} className={'dtab' + (t === tab ? ' on' : '')} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
        ))}
      </div>

      <div className="drawer-body">
        {q.isError && <div className="alert">{(q.error as Error).message}</div>}

        {tab === 'overview' && obj && (
          <div className="ov">
            <Row k="Kind" v={obj.getKind()} />
            {obj.getNs() && <Row k="Namespace" v={obj.getNs()!} />}
            <Row k="Created" v={`${obj.getCreationTimestamp() ?? ''} (${obj.getAge()} ago)`} />
            {obj.getOwner() && <Row k="Controlled by" v={obj.getOwner()!} />}
            <div className="lbl" style={{ marginTop: 12, marginBottom: 6 }}>Labels</div>
            <div className="chips">{Object.entries(obj.getLabels()).map(([k, v]) => <span key={k} className="chip">{k}={v}</span>)}
              {!Object.keys(obj.getLabels()).length && <span className="muted">—</span>}</div>
            <div className="lbl" style={{ marginTop: 12, marginBottom: 6 }}>Annotations</div>
            <div className="chips">{Object.keys(obj.getAnnotations()).map((k) => <span key={k} className="chip">{k}</span>)}
              {!Object.keys(obj.getAnnotations()).length && <span className="muted">—</span>}</div>
            {Array.isArray((obj.status as { conditions?: unknown }).conditions) && (
              <>
                <div className="lbl" style={{ marginTop: 12, marginBottom: 6 }}>Conditions</div>
                <div className="chips">{((obj.status as { conditions: { type: string; status: string }[] }).conditions).map((c, i) => (
                  <span key={i} className={'pill ' + (c.status === 'True' ? 'ok' : 'off')}><span className="d" />{c.type}</span>
                ))}</div>
              </>
            )}
            {q.data && <KindDetails obj={q.data} resourceId={details.resourceId} />}
          </div>
        )}

        {tab === 'yaml' && (
          <div className="yaml-wrap">
            <div className="yaml-bar">
              <span className="muted" style={{ fontSize: 11.5 }}>{dirty ? 'Modified — Apply to persist' : 'Editing the live object'}</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button className="btn sm" onClick={() => pinEvidence({ kind: 'yaml', title: `${obj?.getKind()}/${details.name}`, contentText: draft, source: details.namespace ? `${details.namespace}/${details.name}` : details.name })}>Pin to case</button>
                <button className="btn sm" disabled={!dirty} onClick={() => { if (q.data) { setDraft(dumpYaml(cleanForYaml(q.data), { noRefs: true, lineWidth: -1 })); setDirty(false); } }}>Reset</button>
                <button className="btn sm primary" disabled={!dirty || applying} onClick={apply}>{applying ? 'Applying…' : 'Apply'}</button>
              </div>
            </div>
            <YamlEditor value={draft} editable onChange={(v) => { setDraft(v); setDirty(true); }} />
          </div>
        )}

        {tab === 'events' && (
          <div>
            {events.isFetching && <div className="muted">Loading events…</div>}
            {events.data?.length === 0 && <div className="muted">No events.</div>}
            {(events.data ?? []).map((e, i) => {
              const ev = e as RawKubeObject & { reason?: string; message?: string; type?: string; lastTimestamp?: string };
              return (
                <div key={i} className="evrow">
                  <span className={'pill ' + (ev.type === 'Warning' ? 'warn' : 'off')}><span className="d" />{ev.reason}</span>
                  <span style={{ fontSize: 12.5 }}>{ev.message}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="ovrow">
      <div className="lbl">{k}</div>
      <div className="mono" style={{ fontSize: 12.5 }}>{v}</div>
    </div>
  );
}
