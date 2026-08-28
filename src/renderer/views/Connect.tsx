import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { AwsCreds, EksClusterSummary } from '@shared/types';
import { useApp } from '../store';
import { parseImportLines } from '../eksCommands';
import type { ConnectMethod } from './Welcome';

const REGIONS = ['ap-south-1', 'us-east-1', 'us-west-2', 'eu-west-1', 'eu-central-1', 'ap-southeast-1'];

export function Connect({ method: initialMethod, onBack, asOverlay }: { method: ConnectMethod; onBack: () => void; asOverlay?: boolean }) {
  const addSession = useApp((s) => s.addSession);
  const [method, setMethod] = useState<ConnectMethod>(initialMethod);
  const [creds, setCreds] = useState<AwsCreds>({ accessKeyId: '', secretAccessKey: '', sessionToken: '', region: 'ap-south-1', endpoint: '' });
  const [clusters, setClusters] = useState<EksClusterSummary[] | null>(null);
  const [commands, setCommands] = useState('');

  const parsed = useMemo(() => (commands.trim() ? parseImportLines(commands) : []), [commands]);

  const scan = useMutation({
    mutationFn: async () => {
      const r = await window.kn.aws.listClusters(creds);
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
    onSuccess: setClusters,
  });

  // Both methods connect the same way: the region comes from the scan's own
  // creds, or (in command mode) from the parsed line — overriding creds.region.
  const connect = useMutation({
    mutationFn: async ({ name, region }: { name: string; region?: string }) => {
      const r = await window.kn.aws.connect({ ...creds, region: region ?? creds.region }, name);
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
    onSuccess: addSession,
  });

  const hasCreds = !!creds.accessKeyId && !!creds.secretAccessKey;
  const err = scan.error || connect.error;

  const field = (label: string, key: keyof AwsCreds, type = 'text', ph = '') => (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div className="lbl" style={{ marginBottom: 5 }}>{label}</div>
      <input className="input mono" type={type} placeholder={ph}
        value={(creds[key] as string) ?? ''} onChange={(e) => setCreds({ ...creds, [key]: e.target.value })} />
    </label>
  );

  const switchMethod = (m: ConnectMethod) => { setMethod(m); scan.reset(); connect.reset(); };

  return (
    <div style={{ ...(asOverlay ? { position: 'fixed', inset: 0, zIndex: 55, background: 'var(--bg)' } : { height: '100vh' }), display: 'grid', placeItems: 'center', padding: 24, overflow: 'auto' }}>
      <div style={{ width: 'min(480px, 100%)' }}>
        <button className="btn sm" style={{ marginBottom: 14 }} onClick={onBack}>{asOverlay ? '← Cancel' : '← Back'}</button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <h1 style={{ fontSize: 22, letterSpacing: '.02em' }}>Connect a cluster</h1>
        </div>

        <div className="seg">
          <button className={method === 'scan' ? 'on' : ''} onClick={() => switchMethod('scan')}>Scan region</button>
          <button className={method === 'cmd' ? 'on' : ''} onClick={() => switchMethod('cmd')}>By command</button>
        </div>

        <div className="card">
          {field('AWS Access Key ID', 'accessKeyId', 'text', 'AKIA… / ASIA…')}
          {field('AWS Secret Access Key', 'secretAccessKey', 'password', '••••••••')}
          {field('Session Token — for assumed / SSO roles', 'sessionToken', 'password', 'optional')}
          {field('AWS endpoint — optional (LocalStack / MiniStack)', 'endpoint', 'text', 'http://localhost:4566')}

          {method === 'scan' ? (
            <>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <div className="lbl" style={{ marginBottom: 5 }}>Region</div>
                <select className="input" value={creds.region} onChange={(e) => { setCreds({ ...creds, region: e.target.value }); setClusters(null); }}>
                  {REGIONS.map((r) => <option key={r}>{r}</option>)}
                </select>
              </label>

              {err && <div className="alert" style={{ marginBottom: 12 }}>{(err as Error).message}</div>}

              {!clusters ? (
                <button className="btn primary" style={{ width: '100%' }}
                  disabled={!hasCreds || scan.isPending} onClick={() => scan.mutate()}>
                  {scan.isPending ? 'Scanning region…' : 'Scan for EKS clusters'}
                </button>
              ) : (
                <div>
                  <div className="lbl" style={{ marginBottom: 8 }}>Pick a cluster ({clusters.length})</div>
                  {clusters.length === 0 && <div className="muted">No EKS clusters found in {creds.region}.</div>}
                  {clusters.map((c) => (
                    <button key={c.name} className="btn" style={{ width: '100%', textAlign: 'left', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}
                      disabled={connect.isPending} onClick={() => connect.mutate({ name: c.name })}>
                      <span className="pill ok"><span className="d" /></span>
                      <span style={{ fontWeight: 600 }}>{c.name}</span>
                      <span className="muted mono" style={{ fontSize: 11 }}>v{c.version} · {c.status}</span>
                      <span style={{ marginLeft: 'auto', color: 'var(--jade)' }}>{connect.isPending ? '…' : '→'}</span>
                    </button>
                  ))}
                  <button className="btn sm" style={{ marginTop: 6 }} onClick={() => setClusters(null)}>← back</button>
                </div>
              )}
              <div className="muted" style={{ fontSize: 11, marginTop: 12 }}>
                Runs <span className="mono">eks:ListClusters</span> for the region, then mints a presigned STS token in memory.
              </div>
            </>
          ) : (
            <>
              <label style={{ display: 'block', marginBottom: 10 }}>
                <div className="lbl" style={{ marginBottom: 5 }}>aws eks commands — one per line</div>
                <textarea className="input mono" style={{ minHeight: 120 }}
                  placeholder={'aws eks update-kubeconfig --name prod-eks --region ap-south-1\naws eks update-kubeconfig --name staging-eks --region us-east-1\n# shorthand also works:  staging-eks us-east-1'}
                  value={commands} onChange={(e) => setCommands(e.target.value)} />
              </label>

              {err && <div className="alert" style={{ marginBottom: 12 }}>{(err as Error).message}</div>}

              {parsed.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div className="lbl" style={{ marginBottom: 8 }}>Parsed clusters ({parsed.filter((p) => !p.error).length} valid)</div>
                  {parsed.map((p, i) => (
                    p.error ? (
                      <div key={i} className="btn" style={{ width: '100%', textAlign: 'left', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10, cursor: 'default', opacity: .8 }}>
                        <span className="pill err"><span className="d" /></span>
                        <span className="mono" style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.raw}</span>
                        <span className="muted" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--danger)', flexShrink: 0 }}>{p.error}</span>
                      </div>
                    ) : (
                      <button key={i} className="btn" style={{ width: '100%', textAlign: 'left', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}
                        disabled={!hasCreds || connect.isPending} onClick={() => connect.mutate({ name: p.name, region: p.region })}>
                        <span className="pill ok"><span className="d" /></span>
                        <span style={{ fontWeight: 600 }}>{p.name}</span>
                        <span className="muted mono" style={{ fontSize: 11 }}>{p.region}</span>
                        <span style={{ marginLeft: 'auto', color: 'var(--jade)' }}>{connect.isPending ? '…' : '→'}</span>
                      </button>
                    )
                  ))}
                </div>
              )}

              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                KubeNinja reads the <span className="mono">--name</span> and <span className="mono">--region</span> from each line and connects with the AWS session above — no local AWS CLI or kubeconfig file is used or written.
              </div>
            </>
          )}
        </div>

        <div className="muted" style={{ fontSize: 11, textAlign: 'center', marginTop: 14 }}>
          Credentials never touch disk. KubeNinja mints a presigned STS token in memory.
        </div>
      </div>
    </div>
  );
}
