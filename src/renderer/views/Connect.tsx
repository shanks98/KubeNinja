import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { AwsCreds, EksClusterSummary } from '@shared/types';
import { useApp } from '../store';

const REGIONS = ['ap-south-1', 'us-east-1', 'us-west-2', 'eu-west-1', 'eu-central-1', 'ap-southeast-1'];

export function Connect() {
  const setSession = useApp((s) => s.setSession);
  const [creds, setCreds] = useState<AwsCreds>({ accessKeyId: '', secretAccessKey: '', sessionToken: '', region: 'ap-south-1' });
  const [clusters, setClusters] = useState<EksClusterSummary[] | null>(null);

  const scan = useMutation({
    mutationFn: async () => {
      const r = await window.kn.aws.listClusters(creds);
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
    onSuccess: setClusters,
  });

  const connect = useMutation({
    mutationFn: async (name: string) => {
      const r = await window.kn.aws.connect(creds, name);
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
    onSuccess: setSession,
  });

  const field = (label: string, key: keyof AwsCreds, type = 'text', ph = '') => (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div className="lbl" style={{ marginBottom: 5 }}>{label}</div>
      <input className={'input' + (key !== 'region' ? ' mono' : '')} type={type} placeholder={ph}
        value={creds[key] ?? ''} onChange={(e) => setCreds({ ...creds, [key]: e.target.value })} />
    </label>
  );

  const err = scan.error || connect.error;

  return (
    <div style={{ height: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ width: 'min(460px, 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 26 }}>🥷</span>
          <h1 style={{ fontSize: 24, letterSpacing: '.02em' }}>Kube<span style={{ color: 'var(--jade)' }}>Ninja</span></h1>
        </div>
        <p className="muted" style={{ marginTop: 0, marginBottom: 20, fontSize: 12.5 }}>
          Connect to an EKS cluster with short-lived AWS session credentials — held in memory only.
        </p>

        <div className="card">
          {field('AWS Access Key ID', 'accessKeyId', 'text', 'AKIA…')}
          {field('AWS Secret Access Key', 'secretAccessKey', 'password', '••••••••')}
          {field('Session Token (for assumed roles)', 'sessionToken', 'password', 'optional')}
          <label style={{ display: 'block', marginBottom: 14 }}>
            <div className="lbl" style={{ marginBottom: 5 }}>Region</div>
            <select className="input" value={creds.region} onChange={(e) => setCreds({ ...creds, region: e.target.value })}>
              {REGIONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>

          {err && <div className="alert" style={{ marginBottom: 12 }}>{(err as Error).message}</div>}

          {!clusters ? (
            <button className="btn primary" style={{ width: '100%' }}
              disabled={!creds.accessKeyId || !creds.secretAccessKey || scan.isPending}
              onClick={() => scan.mutate()}>
              {scan.isPending ? 'Scanning region…' : 'Scan for EKS clusters'}
            </button>
          ) : (
            <div>
              <div className="lbl" style={{ marginBottom: 8 }}>Pick a cluster ({clusters.length})</div>
              {clusters.length === 0 && <div className="muted">No EKS clusters found in {creds.region}.</div>}
              {clusters.map((c) => (
                <button key={c.name} className="btn" style={{ width: '100%', textAlign: 'left', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}
                  disabled={connect.isPending} onClick={() => connect.mutate(c.name)}>
                  <span className="pill ok"><span className="d" /></span>
                  <span style={{ fontWeight: 600 }}>{c.name}</span>
                  <span className="muted mono" style={{ fontSize: 11 }}>v{c.version} · {c.status}</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--jade)' }}>{connect.isPending ? '…' : '→'}</span>
                </button>
              ))}
              <button className="btn sm" style={{ marginTop: 6 }} onClick={() => setClusters(null)}>← back</button>
            </div>
          )}
        </div>
        <div className="muted" style={{ fontSize: 11, textAlign: 'center', marginTop: 14 }}>
          Credentials never touch disk. KubeNinja mints a presigned STS token in memory.
        </div>
      </div>
    </div>
  );
}
