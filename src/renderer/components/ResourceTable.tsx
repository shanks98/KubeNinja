import { useMemo, useState } from 'react';
import type { ResourceDescriptor } from '@shared/types';
import { KubeObject } from '../kube/KubeObject';
import { columnsFor } from '../kube/columns';
import { useApp } from '../store';
import { useResourceActions, type Action } from './actions';

export function ResourceTable({ descriptor, items }: { descriptor: ResourceDescriptor; items: KubeObject[] }) {
  const columns = useMemo(() => columnsFor(descriptor.id, descriptor.namespaced), [descriptor.id, descriptor.namespaced]);
  const [sortId, setSortId] = useState(columns[0].id);
  const [dir, setDir] = useState<1 | -1>(1);
  const setDetails = useApp((s) => s.setDetails);
  const actionsFor = useResourceActions();
  const [menu, setMenu] = useState<{ x: number; y: number; acts: Action[] } | null>(null);

  const col = columns.find((c) => c.id === sortId) ?? columns[0];
  const sorted = useMemo(() => {
    const key = (o: KubeObject): string | number => {
      if (col.sort) return col.sort(o);
      const v = col.value(o);
      return typeof v === 'string' || typeof v === 'number' ? v : o.getName();
    };
    return [...items].sort((a, b) => {
      const ka = key(a); const kb = key(b);
      return (ka < kb ? -1 : ka > kb ? 1 : 0) * dir;
    });
  }, [items, col, dir]);

  const clickHeader = (id: string) => { if (id === sortId) setDir((d) => (d === 1 ? -1 : 1)); else { setSortId(id); setDir(1); } };
  const grid = columns.map((c) => c.width).join(' ') + ' 44px';

  const openMenu = (e: React.MouseEvent, o: KubeObject) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ x: Math.min(r.left, window.innerWidth - 200), y: r.bottom + 2, acts: actionsFor(descriptor, o) });
  };

  return (
    <div className="restable">
      <div className="rt-head" style={{ gridTemplateColumns: grid }}>
        {columns.map((c) => (
          <button key={c.id} className={'rt-h' + (c.id === sortId ? ' on' : '')} onClick={() => clickHeader(c.id)}>
            {c.title}{c.id === sortId ? (dir === 1 ? ' ▲' : ' ▼') : ''}
          </button>
        ))}
        <div />
      </div>
      <div className="rt-body">
        {sorted.map((o) => (
          <div key={o.getId()} className={'rt-row' + (o.isDeleting() ? ' deleting' : '')} style={{ gridTemplateColumns: grid }}
            onClick={() => setDetails({ resourceId: descriptor.id, namespace: o.getNs(), name: o.getName(), uid: o.getId() })}>
            {columns.map((c) => <div key={c.id} className={'rt-c' + (c.mono ? ' mono' : '')}>{c.value(o)}</div>)}
            <button className="rt-menu" onClick={(e) => openMenu(e, o)} title="Actions">⋯</button>
          </div>
        ))}
        {sorted.length === 0 && <div className="muted" style={{ textAlign: 'center', padding: 28 }}>No {descriptor.kind} objects.</div>}
      </div>

      {menu && (
        <>
          <div className="menu-backdrop" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
          <div className="menu" style={{ left: menu.x, top: menu.y }}>
            {menu.acts.map((a, i) => (
              <button key={i} className={'menu-item' + (a.danger ? ' danger' : '')}
                onClick={() => { setMenu(null); void a.run(); }}>{a.label}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
