import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ClusterProfile } from '@shared/types';
import { useApp } from '../store';

/**
 * The "which cluster do you want to connect to?" step. Lists every saved cluster
 * grouped by region; connecting one reuses the credentials staged in the main process
 * (entered on the Add or Reconnect screen), so each is one click and several can be
 * live at once. Entering the shell is an explicit step, so the user connects the set
 * they need first.
 */
export function ConnectPage() {
  const qc = useQueryClient();
  const addSession = useApp((s) => s.addSession);
  const sessions = useApp((s) => s.sessions);
  const setRoute = useApp((s) => s.setRoute);

  const clusters = useQuery({
    queryKey: ['clusters'],
    queryFn: async () => {
      const r = await window.kn.clusters.list();
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
  });

  const connect = useMutation({
    mutationFn: async (p: ClusterProfile) => {
      const r = await window.kn.clusters.reconnect(p.id);
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
    onSuccess: (s) => { addSession(s); void qc.invalidateQueries({ queryKey: ['clusters'] }); },
    onError: (e) => { if ((e as Error).message === 'NO_CREDS') setRoute('reconnect'); },
  });

  const forget = useMutation({
    mutationFn: async (id: string) => { const r = await window.kn.clusters.forget(id); if (!r.ok) throw new Error(r.error); },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['clusters'] }),
  });

  const list = clusters.data ?? [];
  const regions = [...new Set(list.map((c) => c.region))];
  const connected = (p: ClusterProfile) => sessions.some((s) => s.name === p.name && s.region === p.region);
  const nConnected = sessions.length;
  const busyId = connect.isPending ? connect.variables?.id : undefined;
  const err = connect.error && (connect.error as Error).message !== 'NO_CREDS' ? (connect.error as Error).message : null;

  return (
    <div style={{ height: '100vh', overflow: 'auto', display: 'grid', placeItems: 'start center', padding: '32px 20px' }}>
      <div style={{ width: 'min(680px, 100%)' }}>
        <h1 style={{ fontSize: 22, letterSpacing: '.02em', margin: '0 0 4px' }}>Which cluster do you want to connect to?</h1>
        <p className="muted" style={{ margin: '0 0 18px', fontSize: 13.5 }}>
          Pick the clusters you need to work on. Your credentials are held in memory, so each is one click — connect as many as you like.
        </p>

        {list.length > 0 && (
          <div style={{ background: 'var(--jade-bg, #0f2a22)', border: '1px solid #1c4634', color: '#bfe8d4', borderRadius: 9, padding: '9px 13px', fontSize: 13, marginBottom: 16 }}>
            ✓ <b>{list.length}</b> saved cluster{list.length > 1 ? 's' : ''} across <b>{regions.length}</b> region{regions.length > 1 ? 's' : ''}.
          </div>
        )}
        {err && <div className="alert" style={{ marginBottom: 12 }}>{err}</div>}
        {list.length === 0 && <div className="muted" style={{ padding: 20 }}>No saved clusters yet.</div>}

        {regions.map((rg) => {
          const rows = list.filter((c) => c.region === rg);
          return (
            <div key={rg} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 8px' }}>
                <span className="mono" style={{ fontSize: 11.5, color: 'var(--jade)', background: 'var(--jade-bg, #0f2a22)', border: '1px solid #1c4634', borderRadius: 999, padding: '2px 9px' }}>{rg}</span>
                <span className="muted" style={{ fontSize: 11.5 }}>{rows.length} cluster{rows.length > 1 ? 's' : ''}</span>
              </div>
              {rows.map((p) => {
                const on = connected(p);
                const busy = busyId === p.id;
                return (
                  <div key={p.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', marginBottom: 8 }}>
                    <span className={'pill ' + (on ? 'ok' : 'off')}><span className="d" /></span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      <div className="muted mono" style={{ fontSize: 11.5, marginTop: 1 }}>{p.region}{p.version ? ` · v${p.version}` : ''} · {on ? 'connected' : busy ? 'connecting' : 'saved'}</div>
                    </div>
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button className={'btn sm' + (on ? '' : ' primary')} disabled={on || busy} onClick={() => connect.mutate(p)}>
                        {on ? 'Connected' : busy ? 'Minting token…' : 'Connect'}
                      </button>
                      <button className="btn sm" title="Forget this cluster" onClick={() => forget.mutate(p.id)} style={{ color: 'var(--danger)' }}>✕</button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20, flexWrap: 'wrap', borderTop: '1px solid var(--line)', paddingTop: 18 }}>
          <button className="btn primary" disabled={nConnected === 0} onClick={() => setRoute('shell')}>Open KubeNinja →</button>
          <button className="btn" onClick={() => setRoute('add')}>＋ Add more clusters</button>
          <span className="muted mono" style={{ fontSize: 11.5 }}>
            {nConnected ? `${nConnected} connected — switch between them in the app` : 'Connect at least one to continue'}
          </span>
        </div>
      </div>
    </div>
  );
}
