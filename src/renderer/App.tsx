import { useState } from 'react';
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
  // Pre-session landing: the Welcome screen greets first; a CTA opens Connect.
  // Once one or more clusters are connected we show the active cluster's shell,
  // with Cases/Tools as overlays and "add cluster" opening Connect on top.
  const [connecting, setConnecting] = useState<ConnectMethod | null>(null);

  if (session) {
    return <>
      <ClusterShell key={session.id} />
      {overlay === 'cases' && <CasesView />}
      {overlay === 'tools' && <ToolsView />}
      {addingCluster && <Connect method="scan" asOverlay onBack={() => setAddingCluster(false)} />}
    </>;
  }
  if (connecting || addingCluster) return <Connect method={connecting ?? 'scan'} onBack={() => { setConnecting(null); setAddingCluster(false); }} />;
  return <Welcome onConnect={setConnecting} />;
}
