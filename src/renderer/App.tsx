import { useState } from 'react';
import { useApp } from './store';
import { Connect } from './views/Connect';
import { Welcome, type ConnectMethod } from './views/Welcome';
import { ClusterShell } from './views/ClusterShell';

export function App() {
  const session = useApp((s) => s.session);
  // Pre-session landing: the Welcome screen greets first; a CTA opens Connect
  // with the chosen method. Once a session exists we drop into the cluster UI.
  const [connecting, setConnecting] = useState<ConnectMethod | null>(null);

  if (session) return <ClusterShell />;
  if (connecting) return <Connect method={connecting} onBack={() => setConnecting(null)} />;
  return <Welcome onConnect={setConnecting} />;
}
