import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import type { AwsCreds } from '@shared/types';
import { useApp } from '../store';
import { parseImportLines } from '../eksCommands';

const REGIONS = ['ap-south-1', 'us-east-1', 'us-west-2', 'eu-west-1', 'eu-central-1', 'ap-southeast-1'];

/**
 * First-run / "add more" step: enter credentials once and register the clusters the
 * user works with — pasted `aws eks` lines (any region) or a region scan. All are
 * SAVED (metadata only) and the creds staged in memory; the connect page then lets the
 * user choose which to actually connect. Nothing is written to disk but the cluster list.
 */
export function AddClusters() {
  const setRoute = useApp((s) => s.setRoute);
  const qc = useQueryClient();
  const [method, setMethod] = useState<'cmd' | 'scan'>('cmd');
  const [creds, setCreds] = useState<AwsCreds>({ accessKeyId: '', secretAccessKey: '', sessionToken: '', region: 'ap-south-1', endpoint: '' });
  const [commands, setCommands] = useState('');
  const [scanned, setScanned] = useState<{ name: string; region: string }[] | null>(null);

  const parsed = useMemo(() => (commands.trim() ? parseImportLines(commands) : []), [commands]);
  const valid = parsed.filter((p) => !p.error).map((p) => ({ name: p.name, region: p.region }));

  const scan = useMutation({
    mutationFn: async () => {
      const r = await window.kn.aws.listClusters(creds);
      if (!r.ok) throw new Error(r.error);
      return r.data.map((c) => ({ name: c.name, region: creds.region }));
    },
    onSuccess: setScanned,
  });

  const items = method === 'cmd' ? valid : (scanned ?? []);

  const save = useMutation({
    mutationFn: async () => {
      const s = await window.kn.aws.stageCreds(creds);
      if (!s.ok) throw new Error(s.error);
      const r = await window.kn.clusters.saveMany(items);
      if (!r.ok) throw new Error(r.error);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['clusters'] }); setRoute('connect'); },
  });

  const hasCreds = !!creds.accessKeyId && !!creds.secretAccessKey;
  const err = scan.error || save.error;

  const field = (label: string, key: keyof AwsCreds, type = 'text', ph = '') => (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div className="lbl" style={{ marginBottom: 5 }}>{label}</div>
      <input className="input mono" type={type} placeholder={ph}
        value={(creds[key] as string) ?? ''} onChange={(e) => setCreds({ ...creds, [key]: e.target.value })} />
    </label>
  );

  // Group items by region for the preview.
  const regions = [...new Set(items.map((i) => i.region))];

  return (
    <div style={{ height: '100vh', display: 'grid', placeItems: 'center', padding: 24, overflow: 'auto' }}>
      <div style={{ width: 'min(560px, 100%)' }}>
        <h1 style={{ fontSize: 22, letterSpacing: '.02em', margin: '0 0 4px' }}>Add your clusters</h1>
        <p className="muted" style={{ margin: '0 0 16px', fontSize: 13.5 }}>
          Enter AWS credentials once, then list the clusters you work with — across regions. KubeNinja saves them all; you choose which to connect next.
        </p>

        <div className="seg">
          <button className={method === 'cmd' ? 'on' : ''} onClick={() => setMethod('cmd')}>aws eks commands</button>
          <button className={method === 'scan' ? 'on' : ''} onClick={() => { setMethod('scan'); setScanned(null); }}>Scan a region</button>
        </div>

        <div className="card">
          {field('AWS Access Key ID', 'accessKeyId', 'text', 'AKIA… / ASIA…')}
          {field('AWS Secret Access Key', 'secretAccessKey', 'password', '••••••••')}
          {field('Session Token — for assumed / SSO roles', 'sessionToken', 'password', 'optional')}
          {field('AWS endpoint — optional (LocalStack / MiniStack)', 'endpoint', 'text', 'http://localhost:4566')}

          {method === 'cmd' ? (
            <label style={{ display: 'block', marginBottom: 10 }}>
              <div className="lbl" style={{ marginBottom: 5 }}>aws eks commands — one per line (any region)</div>
              <textarea className="input mono" style={{ minHeight: 130 }}
                placeholder={'aws eks update-kubeconfig --name prod-eks --region us-east-1\naws eks update-kubeconfig --name payments-eks --region eu-west-1\n# shorthand also works:  analytics-eks ap-south-1'}
                value={commands} onChange={(e) => setCommands(e.target.value)} />
            </label>
          ) : (
            <label style={{ display: 'block', marginBottom: 12 }}>
              <div className="lbl" style={{ marginBottom: 5 }}>Region</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <select className="input" value={creds.region} onChange={(e) => { setCreds({ ...creds, region: e.target.value }); setScanned(null); }}>
                  {REGIONS.map((r) => <option key={r}>{r}</option>)}
                </select>
                <button className="btn" disabled={!hasCreds || scan.isPending} onClick={() => scan.mutate()}>
                  {scan.isPending ? 'Scanning…' : 'Scan'}
                </button>
              </div>
            </label>
          )}

          {err && <div className="alert" style={{ marginBottom: 12 }}>{(err as Error).message}</div>}

          {items.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div className="lbl" style={{ marginBottom: 8 }}>{items.length} cluster{items.length > 1 ? 's' : ''} across {regions.length} region{regions.length > 1 ? 's' : ''}</div>
              {regions.map((rg) => (
                <div key={rg} style={{ marginBottom: 6 }}>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--jade)', background: 'var(--jade-bg, #0f2a22)', border: '1px solid #1c4634', borderRadius: 999, padding: '2px 9px', marginRight: 8 }}>{rg}</span>
                  {items.filter((i) => i.region === rg).map((i) => (
                    <span key={i.name} className="mono" style={{ fontSize: 12, marginRight: 10 }}>{i.name}</span>
                  ))}
                </div>
              ))}
            </div>
          )}
          {method === 'cmd' && parsed.some((p) => p.error) && (
            <div className="muted" style={{ fontSize: 11, color: 'var(--danger)', marginBottom: 10 }}>
              {parsed.filter((p) => p.error).length} line(s) couldn’t be parsed and were skipped.
            </div>
          )}

          <button className="btn primary" style={{ width: '100%' }} disabled={!hasCreds || items.length === 0 || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : `Save ${items.length || ''} cluster${items.length === 1 ? '' : 's'} & continue`}
          </button>
        </div>

        <div className="muted" style={{ fontSize: 11, textAlign: 'center', marginTop: 14 }}>
          🔒 Credentials are never saved to disk — only the cluster list is remembered.
        </div>
      </div>
    </div>
  );
}
