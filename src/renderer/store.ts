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
  filePath?: string; // for 'live'
}

interface AppState {
  session: ClusterSession | null;
  activeResource: string; // selected kind id in the sidebar
  namespace: string; // '' = all namespaces
  details: ObjectRef | null;
  dock: DockTab[];
  dockActive: string | null;

  setSession: (s: ClusterSession | null) => void;
  setActiveResource: (id: string) => void;
  setNamespace: (ns: string) => void;
  setDetails: (r: ObjectRef | null) => void;
  openDock: (t: DockTab) => void;
  closeDock: (id: string) => void;
  setDockActive: (id: string | null) => void;
}

export const useApp = create<AppState>((set) => ({
  session: null,
  activeResource: 'pods',
  namespace: '',
  details: null,
  dock: [],
  dockActive: null,

  setSession: (session) => set({ session, details: null, dock: [], dockActive: null }),
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
