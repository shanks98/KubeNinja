import { useEffect, useState, type ReactNode } from 'react';

interface ConfirmReq {
  kind: 'confirm';
  title: string;
  message: ReactNode;
  okLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}
interface PromptReq {
  kind: 'prompt';
  title: string;
  message?: ReactNode;
  label: string;
  initial?: string;
  okLabel?: string;
  resolve: (value: string | null) => void;
}
type Req = ConfirmReq | PromptReq;

let push: ((r: Req) => void) | null = null;

/** Imperative confirm dialog — resolves true/false. */
export function confirmDialog(o: Omit<ConfirmReq, 'kind' | 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => push?.({ kind: 'confirm', ...o, resolve }));
}
/** Imperative single-field prompt — resolves the entered value or null on cancel. */
export function promptDialog(o: Omit<PromptReq, 'kind' | 'resolve'>): Promise<string | null> {
  return new Promise((resolve) => push?.({ kind: 'prompt', ...o, resolve }));
}

/** Mount once near the app root; renders whichever dialog is active. */
export function DialogHost() {
  const [req, setReq] = useState<Req | null>(null);
  const [text, setText] = useState('');

  useEffect(() => {
    push = (r) => { if (r.kind === 'prompt') setText(r.initial ?? ''); setReq(r); };
    return () => { push = null; };
  }, []);

  if (!req) return null;

  const close = (result: boolean | string | null) => {
    if (req.kind === 'confirm') req.resolve(result as boolean);
    else req.resolve(result as string | null);
    setReq(null);
  };

  return (
    <div className="overlay show" onMouseDown={(e) => { if (e.target === e.currentTarget) close(req.kind === 'confirm' ? false : null); }}>
      <div className="modal" style={{ width: 'min(440px, 100%)' }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="mhead"><b>{req.title}</b></div>
        <div style={{ padding: '16px 18px' }}>
          {req.kind === 'confirm' ? (
            <div style={{ fontSize: 13.5 }}>{req.message}</div>
          ) : (
            <>
              {req.message && <div style={{ fontSize: 13.5, marginBottom: 12 }}>{req.message}</div>}
              <div className="lbl" style={{ marginBottom: 5 }}>{req.label}</div>
              <input className="input mono" autoFocus value={text} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') close(text); if (e.key === 'Escape') close(null); }} />
            </>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
            <button className="btn sm" onClick={() => close(req.kind === 'confirm' ? false : null)}>Cancel</button>
            <button className={'btn sm ' + (req.kind === 'confirm' && req.danger ? 'danger' : 'primary')}
              onClick={() => close(req.kind === 'confirm' ? true : text)}>
              {req.okLabel ?? (req.kind === 'confirm' ? 'Confirm' : 'OK')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
