import { useEffect, useState } from 'react';
import type { CaseSummary, EvidenceKind } from '@shared/types';
import { toast } from '../Toast';

interface PinInput { kind: EvidenceKind; title: string; contentText?: string; source?: string }
let opener: ((input: PinInput) => void) | null = null;

/** Pin a piece of evidence (yaml/snippet/note) to a case — opens a case picker. */
export function pinEvidence(input: PinInput): void { opener?.(input); }

export function PinHost() {
  const [req, setReq] = useState<PinInput | null>(null);
  const [list, setList] = useState<CaseSummary[]>([]);
  const [title, setTitle] = useState('');

  useEffect(() => {
    opener = (input) => {
      setReq(input); setTitle('');
      window.kn.cases.list().then((r) => { if (r.ok) setList(r.data); });
    };
    return () => { opener = null; };
  }, []);

  if (!req) return null;

  const pin = async (caseId: string) => {
    const r = await window.kn.cases.addEvidence(caseId, req);
    toast(r.ok ? 'Pinned to case' : r.error);
    setReq(null);
  };
  const createAndPin = async () => {
    if (!title.trim()) return;
    const c = await window.kn.cases.create({ title: title.trim() });
    if (c.ok) await pin(c.data.id); else toast(c.error);
  };

  return (
    <div className="overlay show" onMouseDown={(e) => { if (e.target === e.currentTarget) setReq(null); }}>
      <div className="modal" style={{ width: 'min(460px,100%)' }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="mhead"><b>Pin to case</b><button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setReq(null)}>✕</button></div>
        <div style={{ padding: '12px 16px' }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>{req.title} <span className="mono">· {req.kind}</span></div>
          <div style={{ maxHeight: 240, overflow: 'auto', marginBottom: 12 }}>
            {list.length === 0 && <div className="muted" style={{ fontSize: 12 }}>No cases yet — create one below.</div>}
            {list.map((c) => (
              <button key={c.id} className="btn" style={{ width: '100%', textAlign: 'left', marginBottom: 6, display: 'flex', gap: 8, alignItems: 'center' }} onClick={() => pin(c.id)}>
                <span style={{ fontWeight: 600 }}>{c.title}</span>
                <span className="muted mono" style={{ fontSize: 11, marginLeft: 'auto' }}>{c.findingCount} findings</span>
              </button>
            ))}
          </div>
          <div className="lbl" style={{ marginBottom: 5 }}>Or start a new case</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input sm" placeholder="Case title" value={title} onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') createAndPin(); }} />
            <button className="btn sm primary" disabled={!title.trim()} onClick={createAndPin}>Create &amp; pin</button>
          </div>
        </div>
      </div>
    </div>
  );
}
