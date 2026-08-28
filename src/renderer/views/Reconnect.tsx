import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { AwsCreds } from '@shared/types';
import { useApp } from '../store';

/**
 * Re-login: the user's clusters are already saved, so all we need is credentials.
 * No region, no re-scan — we stage the creds in the main process and go straight to
 * the connect page to pick which saved cluster(s) to work on.
 */
export function Reconnect() {
  const setRoute = useApp((s) => s.setRoute);
  const [creds, setCreds] = useState<AwsCreds>({ accessKeyId: '', secretAccessKey: '', sessionToken: '', region: 'us-east-1', endpoint: '' });

  const saved = useQuery({
    queryKey: ['clusters'],
    queryFn: async () => { const r = await window.kn.clusters.list(); if (!r.ok) throw new Error(r.error); return r.data; },
  });
  const list = saved.data ?? [];
  const regions = [...new Set(list.map((c) => c.region))];

  const go = useMutation({
    mutationFn: async () => { const r = await window.kn.aws.stageCreds(creds); if (!r.ok) throw new Error(r.error); },
    onSuccess: () => setRoute('connect'),
  });

  const hasCreds = !!creds.accessKeyId && !!creds.secretAccessKey;
  const field = (label: string, key: keyof AwsCreds, type = 'text', ph = '') => (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div className="lbl" style={{ marginBottom: 5 }}>{label}</div>
      <input className="input mono" type={type} placeholder={ph}
        value={(creds[key] as string) ?? ''} onChange={(e) => setCreds({ ...creds, [key]: e.target.value })} />
    </label>
  );

  return (
    <div style={{ height: '100vh', display: 'grid', placeItems: 'center', padding: 24, overflow: 'auto' }}>
      <div style={{ width: 'min(440px, 100%)' }}>
        <h1 style={{ fontSize: 22, letterSpacing: '.02em', margin: '0 0 4px' }}>Welcome back</h1>
        <p className="muted" style={{ margin: '0 0 20px', fontSize: 13.5 }}>
          Your clusters are remembered. Enter your AWS credentials once to bring them back — no region, no re-scan.
        </p>
        <div className="card">
          {list.length > 0 && (
            <div className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, marginBottom: 16 }}>
              <span className="mono" style={{ fontSize: 11, color: 'var(--jade)', background: 'var(--jade-bg, #0f2a22)', border: '1px solid #1c4634', borderRadius: 999, padding: '2px 9px' }}>{list.length} saved</span>
              cluster{list.length > 1 ? 's' : ''}{regions.length ? ` · ${regions.join(', ')}` : ''}
            </div>
          )}
          {field('AWS Access Key ID', 'accessKeyId', 'text', 'AKIA… / ASIA…')}
          {field('AWS Secret Access Key', 'secretAccessKey', 'password', '••••••••')}
          {field('Session Token — for assumed / SSO roles', 'sessionToken', 'password', 'optional')}
          {go.error && <div className="alert" style={{ marginBottom: 12 }}>{(go.error as Error).message}</div>}
          <button className="btn primary" style={{ width: '100%' }} disabled={!hasCreds || go.isPending} onClick={() => go.mutate()}>
            {go.isPending ? 'Reconnecting…' : 'Reconnect →'}
          </button>
        </div>
        <div className="muted" style={{ fontSize: 11, textAlign: 'center', marginTop: 14 }}>
          🔒 Credentials are never written to disk — held in memory for this session only.
        </div>
        <div style={{ textAlign: 'center', marginTop: 10 }}>
          <button className="btn sm" onClick={() => setRoute('add')}>＋ Add more clusters</button>
        </div>
      </div>
    </div>
  );
}
