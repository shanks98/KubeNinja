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
  // Pre-session landing: the Welcome screen greets first; a CTA opens Connect
  // with the chosen method. Once a session exists we drop into the cluster UI,
  // with the investigation Cases and Tools available as full-screen views on top.
  const [connecting, setConnecting] = useState<ConnectMethod | null>(null);

  if (session) {
    return <>
      <ClusterShell />
      {overlay === 'cases' && <CasesView />}
      {overlay === 'tools' && <ToolsView />}
    </>;
  }
  if (connecting) return <Connect method={connecting} onBack={() => setConnecting(null)} />;
  return <Welcome onConnect={setConnecting} />;
}
