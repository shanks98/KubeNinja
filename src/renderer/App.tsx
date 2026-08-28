import { useEffect, useState } from 'react';
import type { ClusterProfile } from '@shared/types';
import { useApp } from './store';
import { Connect } from './views/Connect';
import { Welcome, type ConnectMethod } from './views/Welcome';
import { ClusterShell } from './views/ClusterShell';
import { CasesView } from './components/cases/CasesView';
import { ToolsView } from './components/tools/ToolsView';

export function App() {
  const session = useApp((s) => s.session);
  const overlay = useApp((s) => s.overlay);
  const addingCluster = useApp((s) => s.addingCluster);
  const setAddingCluster = useApp((s) => s.setAddingCluster);
  const setOverlay = useApp((s) => s.setOverlay);
  // Pre-session landing: the Welcome screen greets first; a CTA opens Connect.
  // Once one or more clusters are connected we show the active cluster's shell,
  // with Cases/Tools as overlays and "add cluster" opening Connect on top.
  const [connecting, setConnecting] = useState<ConnectMethod | null>(null);
  // A saved cluster the user chose to reconnect but whose region has no live creds
  // yet — Connect opens prefilled so they only need to paste credentials.
  const [reconnectTarget, setReconnectTarget] = useState<ClusterProfile | null>(null);

  // Native-menu actions (File → Add cluster / Cases / Tools).
  useEffect(() => window.kn.app.onMenu((action) => {
    if (action === 'menu:add-cluster') useApp.getState().session ? setAddingCluster(true) : setConnecting('scan');
    else if (action === 'menu:open-cases' && useApp.getState().session) setOverlay('cases');
    else if (action === 'menu:open-tools' && useApp.getState().session) setOverlay('tools');
  }), [setAddingCluster, setOverlay]);

  // Once a session lands, drop any pending connect/reconnect flow.
  useEffect(() => { if (session) { setConnecting(null); setReconnectTarget(null); } }, [session]);

  if (session) {
    return <>
      <ClusterShell key={session.id} />
      {overlay === 'cases' && <CasesView />}
      {overlay === 'tools' && <ToolsView />}
      {addingCluster && <Connect method="scan" asOverlay onBack={() => setAddingCluster(false)} />}
      {reconnectTarget && <Connect method="scan" reconnect={reconnectTarget} asOverlay onBack={() => setReconnectTarget(null)} />}
    </>;
  }
  if (reconnectTarget) return <Connect method="scan" reconnect={reconnectTarget} onBack={() => setReconnectTarget(null)} />;
  if (connecting || addingCluster) return <Connect method={connecting ?? 'scan'} onBack={() => { setConnecting(null); setAddingCluster(false); }} />;
  return <Welcome onConnect={setConnecting} onNeedCreds={setReconnectTarget} />;
}
