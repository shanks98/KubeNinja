import { useApp } from './store';
import { Connect } from './views/Connect';
import { ClusterShell } from './views/ClusterShell';

export function App() {
  const session = useApp((s) => s.session);
  return session ? <ClusterShell /> : <Connect />;
}
