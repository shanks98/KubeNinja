import { create } from 'zustand';
import type { ClusterSession } from '@shared/types';

interface AppState {
  session: ClusterSession | null;
  view: 'resources' | 'metrics' | 'cases' | 'helm' | 'map';
  setSession: (s: ClusterSession | null) => void;
  setView: (v: AppState['view']) => void;
}

export const useApp = create<AppState>((set) => ({
  session: null,
  view: 'resources',
  setSession: (session) => set({ session }),
  setView: (view) => set({ view }),
}));
