import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CaseDetail, CaseSummary, Evidence, Finding, Severity } from '@shared/types';
import { SEVERITIES, FINDING_STATUSES } from '@shared/types';
import { useApp } from '../../store';
import { confirmDialog, promptDialog } from '../Dialog';
import { toast } from '../Toast';

const SEV_COLOR: Record<Severity, string> = { critical: '#ff4757', high: '#f5a524', medium: '#56a8ff', low: '#8b94a7', info: '#5c6577' };
function SevPill({ s }: { s: Severity }) {
  return <span className="pill" style={{ color: SEV_COLOR[s], borderColor: SEV_COLOR[s] }}><span className="d" />{s}</span>;
}

export function CasesView() {
  const setOverlay = useApp((s) => s.setOverlay);
  const selected = useApp((s) => s.selectedCase);
  const setSelected = useApp((s) => s.setSelectedCase);
  const session = useApp((s) => s.session);
  const qc = useQueryClient();

  const cases = useQuery({ queryKey: ['cases'], queryFn: async () => { const r = await window.kn.cases.list(); if (!r.ok) throw new Error(r.error); return r.data; } });

  const newCase = async () => {
    const title = await promptDialog({ title: 'New case', label: 'Case title', okLabel: 'Create' });
    if (!title?.trim()) return;
    const r = await window.kn.cases.create({ title: title.trim(), cluster: session?.name });
    if (r.ok) { qc.invalidateQueries({ queryKey: ['cases'] }); setSelected(r.data.id); } else toast(r.error);
  };

  return (
    <div className="cases">
      <div className="titlebar">
        <button className="btn sm" onClick={() => setOverlay(null)}>← Cluster</button>
        <div className="nav">
          <button className="on">Cases</button>
          <button onClick={() => setOverlay('tools')}>Tools</button>
        </div>
        <span className="muted mono" style={{ fontSize: 12 }}>{cases.data?.length ?? 0} cases</span>
        <button className="btn sm primary" style={{ marginLeft: 'auto' }} onClick={newCase}>+ New case</button>
      </div>
      <div className="cases-main">
        <div className="case-list">
          {cases.data?.length === 0 && <div className="muted" style={{ padding: 16, fontSize: 12.5 }}>No cases yet. Create one, or pin evidence from the cluster view.</div>}
          {(cases.data ?? []).map((c) => <CaseCard key={c.id} c={c} active={c.id === selected} onClick={() => setSelected(c.id)} />)}
        </div>
        <div className="case-detail">
          {selected ? <CaseDetailView key={selected} id={selected} /> : <div className="muted" style={{ padding: 30, textAlign: 'center' }}>Select a case, or create one.</div>}
        </div>
      </div>
    </div>
  );
}

function CaseCard({ c, active, onClick }: { c: CaseSummary; active: boolean; onClick: () => void }) {
  return (
    <button className={'case-card' + (active ? ' on' : '')} onClick={onClick}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {c.rollup.top ? <SevPill s={c.rollup.top} /> : <span className="pill off"><span className="d" />clear</span>}
        <span className="muted mono" style={{ fontSize: 11, marginLeft: 'auto' }}>{c.status}</span>
      </div>
      <div style={{ fontWeight: 600, margin: '6px 0 2px' }}>{c.title}</div>
      <div className="muted" style={{ fontSize: 11.5 }}>{c.findingCount} findings · {c.rollup.open} open{c.cluster ? ` · ${c.cluster}` : ''}</div>
    </button>
  );
}

function CaseDetailView({ id }: { id: string }) {
  const qc = useQueryClient();
  const setSelected = useApp((s) => s.setSelectedCase);
  const [tab, setTab] = useState<'findings' | 'timeline' | 'evidence' | 'report'>('findings');
  const q = useQuery({ queryKey: ['case', id], queryFn: async () => { const r = await window.kn.cases.get(id); if (!r.ok) throw new Error(r.error); return r.data; } });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['case', id] }); qc.invalidateQueries({ queryKey: ['cases'] }); };

  if (q.isError) return <div className="alert" style={{ margin: 16 }}>{(q.error as Error).message}</div>;
  if (!q.data) return <div className="muted" style={{ padding: 20 }}>Loading…</div>;
  const d = q.data;

  const setStatus = async () => {
    const next = d.case.status === 'open' ? 'closed' : 'open';
    await window.kn.cases.update(id, { status: next }); refresh();
  };
  const del = async () => {
    if (await confirmDialog({ title: 'Delete case', message: <>Delete <b>{d.case.title}</b> and all its findings & evidence?</>, okLabel: 'Delete', danger: true })) {
      await window.kn.cases.remove(id); setSelected(null); qc.invalidateQueries({ queryKey: ['cases'] });
    }
  };

  return (
    <div className="cd">
      <div className="cd-head">
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {d.rollup.top ? <SevPill s={d.rollup.top} /> : <span className="pill off"><span className="d" />clear</span>}
            <h2 style={{ fontSize: 17 }}>{d.case.title}</h2>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{d.case.cluster ? `${d.case.cluster} · ` : ''}{d.findings.length} findings · {d.rollup.open} open · opened {new Date(d.case.createdAt).toLocaleDateString()}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn sm" onClick={setStatus}>{d.case.status === 'open' ? 'Close case' : 'Reopen'}</button>
          <button className="btn sm danger" onClick={del}>Delete</button>
        </div>
      </div>
      <div className="drawer-tabs" style={{ padding: '0 16px' }}>
        {(['findings', 'timeline', 'evidence', 'report'] as const).map((t) => (
          <button key={t} className={'dtab' + (t === tab ? ' on' : '')} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}
            {t === 'findings' ? ` (${d.findings.length})` : t === 'evidence' ? ` (${d.evidence.length})` : ''}</button>
        ))}
      </div>
      <div className="cd-body">
        {tab === 'findings' && <Findings d={d} onChange={refresh} />}
        {tab === 'timeline' && <Timeline d={d} />}
        {tab === 'evidence' && <EvidencePanel d={d} onChange={refresh} />}
        {tab === 'report' && <ReportPanel id={id} title={d.case.title} />}
      </div>
    </div>
  );
}

function Findings({ d, onChange }: { d: CaseDetail; onChange: () => void }) {
  const [title, setTitle] = useState('');
  const [sev, setSev] = useState<Severity>('high');
  const [detail, setDetail] = useState('');

  const add = async () => {
    if (!title.trim()) return;
    const r = await window.kn.cases.addFinding(d.case.id, { title: title.trim(), severity: sev, detail: detail.trim() || undefined });
    if (r.ok) { setTitle(''); setDetail(''); onChange(); } else toast(r.error);
  };
  const patch = async (f: Finding, p: Partial<Finding>) => { await window.kn.cases.updateFinding(f.id, p); onChange(); };
  const remove = async (f: Finding) => { if (await confirmDialog({ title: 'Delete finding', message: <>Delete <b>{f.title}</b>?</>, okLabel: 'Delete', danger: true })) { await window.kn.cases.removeFinding(f.id); onChange(); } };

  return (
    <div>
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input sm" placeholder="Finding title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <select className="input sm" style={{ width: 'auto' }} value={sev} onChange={(e) => setSev(e.target.value as Severity)}>
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="btn sm primary" disabled={!title.trim()} onClick={add}>Add finding</button>
        </div>
        <input className="input sm" placeholder="Detail (optional)" value={detail} onChange={(e) => setDetail(e.target.value)} style={{ marginTop: 8 }} />
      </div>
      {d.findings.length === 0 && <div className="muted" style={{ padding: 8 }}>No findings yet.</div>}
      {d.findings.map((f) => (
        <div key={f.id} className="finding">
          <SevPill s={f.severity} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{f.title}</div>
            {f.detail && <div className="muted" style={{ fontSize: 12 }}>{f.detail}</div>}
            {f.resource && <div className="mono muted" style={{ fontSize: 11 }}>{f.resource}</div>}
          </div>
          <select className="input sm" style={{ width: 'auto' }} value={f.severity} onChange={(e) => patch(f, { severity: e.target.value as Severity })}>
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="input sm" style={{ width: 'auto' }} value={f.status} onChange={(e) => patch(f, { status: e.target.value as Finding['status'] })}>
            {FINDING_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="btn sm" onClick={() => remove(f)}>✕</button>
        </div>
      ))}
    </div>
  );
}

const TL_ICON: Record<string, string> = { event: '•', action: '⚡', finding: '⚑', evidence: '📎' };
function Timeline({ d }: { d: CaseDetail }) {
  if (!d.timeline.length) return <div className="muted" style={{ padding: 8 }}>No events yet.</div>;
  return (
    <div className="timeline">
      {d.timeline.map((t, i) => (
        <div key={i} className="tl-item">
          <span className="tl-ic" style={{ color: t.kind === 'action' && t.ok === false ? 'var(--danger)' : 'var(--jade)' }}>{TL_ICON[t.kind] ?? '•'}</span>
          <span style={{ fontSize: 12.5 }}>{t.text}</span>
          <span className="mono muted" style={{ marginLeft: 'auto', fontSize: 11, whiteSpace: 'nowrap' }}>{new Date(t.ts).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function EvidencePanel({ d, onChange }: { d: CaseDetail; onChange: () => void }) {
  const [noteTitle, setNoteTitle] = useState('');
  const [noteText, setNoteText] = useState('');

  const addNote = async () => {
    if (!noteText.trim()) return;
    const r = await window.kn.cases.addEvidence(d.case.id, { kind: 'note', title: noteTitle.trim() || 'Note', contentText: noteText.trim() });
    if (r.ok) { setNoteTitle(''); setNoteText(''); onChange(); } else toast(r.error);
  };
  const screenshot = async () => {
    const cap = await window.kn.app.capture();
    if (!cap.ok) { toast(cap.error); return; }
    const r = await window.kn.cases.addScreenshot(d.case.id, { title: `Screenshot ${new Date().toLocaleTimeString()}`, dataUrl: cap.data });
    if (r.ok) onChange(); else toast(r.error);
  };
  const remove = async (e: Evidence) => { await window.kn.cases.removeEvidence(e.id); onChange(); };

  return (
    <div>
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input className="input sm" placeholder="Note title" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} />
          <button className="btn sm" onClick={screenshot}>📷 Capture screenshot</button>
        </div>
        <textarea className="input mono" style={{ minHeight: 60, fontSize: 12 }} placeholder="Note / snippet text…" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
        <button className="btn sm primary" style={{ marginTop: 8 }} disabled={!noteText.trim()} onClick={addNote}>Add note</button>
      </div>
      {d.evidence.length === 0 && <div className="muted" style={{ padding: 8 }}>No evidence pinned. Pin YAML or logs from the cluster view, add a note, or capture a screenshot.</div>}
      {d.evidence.map((e) => <EvidenceCard key={e.id} e={e} onRemove={() => remove(e)} />)}
    </div>
  );
}

function EvidenceCard({ e, onRemove }: { e: Evidence; onRemove: () => void }) {
  const img = useQuery({
    enabled: e.kind === 'screenshot',
    queryKey: ['evidence', e.id],
    queryFn: async () => { const r = await window.kn.cases.evidenceDataUrl(e.id); if (!r.ok) throw new Error(r.error); return r.data; },
  });
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <b style={{ fontSize: 13 }}>{e.title}</b>
        <span className="muted mono" style={{ fontSize: 11 }}>{e.kind}{e.source ? ` · ${e.source}` : ''}</span>
        <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={onRemove}>✕</button>
      </div>
      {e.kind === 'screenshot'
        ? (img.data ? <img src={img.data} alt={e.title} style={{ maxWidth: '100%', borderRadius: 8, marginTop: 8, border: '1px solid var(--border)' }} /> : <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Loading image…</div>)
        : <pre className="evtext">{e.contentText}</pre>}
    </div>
  );
}

function ReportPanel({ id, title }: { id: string; title: string }) {
  const [html, setHtml] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const load = async () => { setLoading(true); const r = await window.kn.cases.report(id, 'html'); setLoading(false); if (r.ok) setHtml(r.data); else toast(r.error); };
  const download = async (fmt: 'html' | 'json') => {
    const r = await window.kn.cases.report(id, fmt);
    if (!r.ok) { toast(r.error); return; }
    const url = URL.createObjectURL(new Blob([r.data], { type: fmt === 'html' ? 'text/html' : 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `${title.replace(/\W+/g, '-').toLowerCase()}-report.${fmt}`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button className="btn sm" onClick={load}>{loading ? 'Rendering…' : 'Preview report'}</button>
        <button className="btn sm primary" onClick={() => download('html')}>Export HTML</button>
        <button className="btn sm" onClick={() => download('json')}>Export JSON</button>
      </div>
      {html
        ? <iframe title="report" sandbox="" srcDoc={html} style={{ flex: 1, minHeight: 320, border: '1px solid var(--border)', borderRadius: 8, background: '#0a0c11' }} />
        : <div className="muted" style={{ fontSize: 12.5 }}>Preview the self-contained HTML report, or export HTML / JSON to save it.</div>}
    </div>
  );
}
