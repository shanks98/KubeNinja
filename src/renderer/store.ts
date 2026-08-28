import { create } from 'zustand';
import type { ClusterSession } from '@shared/types';

/** A reference to a specific object (for the details drawer). */
export interface ObjectRef { resourceId: string; namespace?: string; name: string; uid: string }

/** A bottom-dock tab: a log/live/trace viewer or an exec terminal. */
export interface DockTab {
  id: string;
  mode: 'logs' | 'live' | 'trace' | 'exec';
  title: string;
  namespace: string;
  pod: string;
  container?: string;
  containers?: string[]; // all containers on the pod (for the picker)
  filePath?: string; // for 'live'
}

// The pre-shell wizard route. 'boot' resolves to 'reconnect' (saved clusters exist)
// or 'welcome' (first run) on startup; 'shell' is the connected cluster IDE.
export type Route = 'boot' | 'welcome' | 'add' | 'reconnect' | 'connect' | 'shell';

interface AppState {
  route: Route;
  sessions: ClusterSession[];   // every connected cluster (held in the main process too)
  session: ClusterSession | null; // the active one
  addingCluster: boolean;       // the "add a cluster" connect flow is open
  activeResource: string; // selected kind id in the sidebar
  namespace: string; // '' = all namespaces
  details: ObjectRef | null;
  dock: DockTab[];
  dockActive: string | null;
  overlay: 'cases' | 'tools' | null;
  selectedCase: string | null;

  setRoute: (r: Route) => void;
  addSession: (s: ClusterSession) => void;
  switchCluster: (id: string) => void;
  removeSession: (id: string) => void;
  clearSessions: () => void;
  setAddingCluster: (v: boolean) => void;
  setOverlay: (o: AppState['overlay']) => void;
  setSelectedCase: (id: string | null) => void;
  setActiveResource: (id: string) => void;
  setNamespace: (ns: string) => void;
  setDetails: (r: ObjectRef | null) => void;
  openDock: (t: DockTab) => void;
  closeDock: (id: string) => void;
  setDockActive: (id: string | null) => void;
}

// Per-cluster view state is reset when the active cluster changes (dock streams,
// the details drawer and the namespace filter all belong to a specific cluster).
const reset = (): Pick<AppState, 'details' | 'dock' | 'dockActive' | 'namespace'> => ({ details: null, dock: [], dockActive: null, namespace: '' });

export const useApp = create<AppState>((set) => ({
  route: 'boot',
  sessions: [],
  session: null,
  addingCluster: false,
  activeResource: 'pods',
  namespace: '',
  details: null,
  dock: [],
  dockActive: null,
  overlay: null,
  selectedCase: null,

  setRoute: (route) => set({ route }),
  // A new session is made active but the route is left alone — the connect page stays
  // up so the user can bring up more clusters before entering the shell.
  addSession: (s) => set((st) => ({
    sessions: st.sessions.some((x) => x.id === s.id) ? st.sessions : [...st.sessions, s],
    session: s, addingCluster: false, overlay: null, ...reset(),
  })),
  switchCluster: (id) => set((st) => {
    const session = st.sessions.find((x) => x.id === id) ?? null;
    return session ? { session, ...reset() } : {};
  }),
  removeSession: (id) => set((st) => {
    const sessions = st.sessions.filter((x) => x.id !== id);
    if (st.session?.id !== id) return { sessions };
    const session = sessions[sessions.length - 1] ?? null;
    // Left the shell with nothing connected — fall back to the connect page.
    const route: Partial<AppState> = !session && st.route === 'shell' ? { route: 'connect' as Route } : {};
    return { sessions, session, ...reset(), ...route };
  }),
  clearSessions: () => set({ sessions: [], session: null, route: 'boot', ...reset(), overlay: null }),
  setAddingCluster: (addingCluster) => set({ addingCluster }),
  setOverlay: (overlay) => set({ overlay }),
  setSelectedCase: (selectedCase) => set({ selectedCase }),
  setActiveResource: (activeResource) => set({ activeResource, details: null }),
  setNamespace: (namespace) => set({ namespace }),
  setDetails: (details) => set({ details }),
  openDock: (t) => set((s) => (s.dock.some((d) => d.id === t.id)
    ? { dockActive: t.id }
    : { dock: [...s.dock, t], dockActive: t.id })),
  closeDock: (id) => set((s) => {
    const dock = s.dock.filter((d) => d.id !== id);
    const dockActive = s.dockActive === id ? (dock.length ? dock[dock.length - 1].id : null) : s.dockActive;
    return { dock, dockActive };
  }),
  setDockActive: (dockActive) => set({ dockActive }),
}));
