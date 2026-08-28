import { useEffect } from 'react';
import { useApp } from './store';
import { Welcome } from './views/Welcome';
import { AddClusters } from './views/AddClusters';
import { Reconnect } from './views/Reconnect';
import { ConnectPage } from './views/ConnectPage';
import { ClusterShell } from './views/ClusterShell';
import { CasesView } from './components/cases/CasesView';
import { ToolsView } from './components/tools/ToolsView';

/**
 * Top-level router. Two ways in:
 *   first run   → Welcome → Add clusters (creds + aws eks list) → Connect page → Shell
 *   returning   → Reconnect (creds only)                        → Connect page → Shell
 * The connect page is where the user picks which saved cluster(s) to bring up, and
 * several can be connected before entering the shell.
 */
export function App() {
  const route = useApp((s) => s.route);
  const setRoute = useApp((s) => s.setRoute);
  const overlay = useApp((s) => s.overlay);
  const session = useApp((s) => s.session);

  // Boot: saved clusters → Reconnect; otherwise the first-run Welcome.
  useEffect(() => {
    if (route !== 'boot') return;
    let cancelled = false;
    void (async () => {
      const r = await window.kn.clusters.list();
      if (cancelled) return;
      setRoute(r.ok && r.data.length > 0 ? 'reconnect' : 'welcome');
    })();
    return () => { cancelled = true; };
  }, [route, setRoute]);

  // If we somehow land on the shell with nothing connected, fall back to the picker.
  useEffect(() => { if (route === 'shell' && !session) setRoute('connect'); }, [route, session, setRoute]);

  // Native-menu actions (File → Add cluster / Cases / Tools).
  useEffect(() => window.kn.app.onMenu((action) => {
    const st = useApp.getState();
    if (action === 'menu:add-cluster') st.setRoute('add');
    else if (action === 'menu:open-cases' && st.session) st.setOverlay('cases');
    else if (action === 'menu:open-tools' && st.session) st.setOverlay('tools');
  }), []);

  switch (route) {
    case 'boot': return null;
    case 'welcome': return <Welcome onConnect={() => setRoute('add')} />;
    case 'add': return <AddClusters />;
    case 'reconnect': return <Reconnect />;
    case 'connect': return <ConnectPage />;
    case 'shell':
      if (!session) return null;
      return <>
        <ClusterShell key={session.id} />
        {overlay === 'cases' && <CasesView />}
        {overlay === 'tools' && <ToolsView />}
      </>;
  }
}
