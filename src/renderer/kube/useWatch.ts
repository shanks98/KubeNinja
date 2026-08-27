import { useEffect, useRef, useState } from 'react';
import type { WatchEvent } from '@shared/types';
import { KubeObject } from './KubeObject';

interface WatchState { items: KubeObject[]; error?: string; live: boolean }

/**
 * Subscribe to a live watch of one kind (optionally namespace-scoped) and expose
 * its objects keyed by uid. Incoming ADDED/MODIFIED/DELETED events are buffered and
 * flushed on an animation frame (Freelens's eventsBuffer drain) so a burst of
 * events causes one render, not hundreds.
 */
export function useWatch(sessionId: string, resourceId: string, namespace: string | undefined): WatchState {
  const [state, setState] = useState<WatchState>({ items: [], live: false });
  const store = useRef(new Map<string, KubeObject>());
  const buffer = useRef<WatchEvent[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    store.current = new Map();
    buffer.current = [];
    setState({ items: [], live: false });

    // Coalesce a burst of events into one render via a short timer. (A timer, not
    // requestAnimationFrame, so updates keep flowing when the window is hidden.)
    const flush = () => {
      timer.current = null;
      const m = store.current;
      let err: string | undefined;
      for (const ev of buffer.current) {
        if (ev.type === 'ERROR') { err = ev.message; continue; }
        if (!ev.object) continue;
        const obj = new KubeObject(ev.object);
        if (ev.type === 'DELETED') m.delete(obj.getId());
        else m.set(obj.getId(), obj);
      }
      buffer.current = [];
      setState({ items: [...m.values()], live: true, error: err });
    };

    const unsub = window.kn.kube.watch({ sessionId, resourceId, namespace }, (ev) => {
      buffer.current.push(ev);
      if (timer.current == null) timer.current = setTimeout(flush, 40);
    });

    return () => {
      unsub();
      if (timer.current != null) clearTimeout(timer.current);
    };
  }, [sessionId, resourceId, namespace]);

  return state;
}
