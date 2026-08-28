import { useEffect, useMemo, useRef, useState } from 'react';
import type { RawKubeObject, ResourceGraph, GraphNode, GraphEdge } from '@shared/types';
import { useApp } from '../../store';
import { buildGraph } from '../../map/graph';

const MAP_KINDS = ['pods', 'deployments', 'replicasets', 'statefulsets', 'daemonsets', 'jobs', 'cronjobs', 'horizontalpodautoscalers', 'services', 'ingresses', 'networkpolicies', 'persistentvolumeclaims', 'persistentvolumes', 'configmaps', 'secrets'];

const KIND_COLOR: Record<string, string> = {
  Pod: '#2dd4a7', Deployment: '#56a8ff', StatefulSet: '#56a8ff', ReplicaSet: '#3a7bd5', DaemonSet: '#56a8ff',
  Job: '#7aa2ff', CronJob: '#7aa2ff', HorizontalPodAutoscaler: '#22b892', Service: '#a880ff', Ingress: '#f5a524',
  NetworkPolicy: '#ff8fa3', PersistentVolumeClaim: '#2dd4a7', PersistentVolume: '#1f9e86', ConfigMap: '#8b94a7', Secret: '#f5a524',
};
const EDGE_COLOR: Record<GraphEdge['kind'], string> = { owns: 'rgba(255,255,255,.18)', routes: '#f5a524', selects: '#56a8ff', mounts: '#a880ff', uses: 'rgba(139,148,167,.5)', scales: '#22b892' };
const STATUS_RING: Record<string, string> = { ok: '#2dd4a7', warn: '#f5a524', err: '#ff4757', off: '#5c6577' };

interface Pos extends GraphNode { x: number; y: number; vx: number; vy: number }
const W = 1100, H = 760;

function layout(nodes: GraphNode[], edges: GraphEdge[], iters = 320): Pos[] {
  const P: Pos[] = nodes.map((n, i) => { const a = (i / Math.max(nodes.length, 1)) * 2 * Math.PI; return { ...n, x: W / 2 + Math.cos(a) * Math.min(W, H) * 0.33, y: H / 2 + Math.sin(a) * Math.min(W, H) * 0.33, vx: 0, vy: 0 }; });
  const idx = new Map(P.map((p) => [p.id, p]));
  const REP = 11000, LINK = 95, SPRING = 0.02, CENTER = 0.007, DAMP = 0.9;
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      let dx = P[i].x - P[j].x, dy = P[i].y - P[j].y, d2 = dx * dx + dy * dy; if (d2 < 0.01) d2 = 0.01;
      const d = Math.sqrt(d2), f = REP / d2, fx = (dx / d) * f, fy = (dy / d) * f;
      P[i].vx += fx; P[i].vy += fy; P[j].vx -= fx; P[j].vy -= fy;
    }
    for (const e of edges) { const a = idx.get(e.source), b = idx.get(e.target); if (!a || !b) continue; const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 0.01, f = (d - LINK) * SPRING, fx = (dx / d) * f, fy = (dy / d) * f; a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy; }
    for (const p of P) { p.vx += (W / 2 - p.x) * CENTER; p.vy += (H / 2 - p.y) * CENTER; p.x += p.vx * DAMP; p.y += p.vy * DAMP; p.vx *= 0.82; p.vy *= 0.82; p.x = Math.max(34, Math.min(W - 34, p.x)); p.y = Math.max(34, Math.min(H - 34, p.y)); }
  }
  return P;
}

export function ResourceMap() {
  const session = useApp((s) => s.session)!;
  const storeNs = useApp((s) => s.namespace);
  const setDetails = useApp((s) => s.setDetails);
  const [ns, setNs] = useState(storeNs || 'default');
  const [graph, setGraph] = useState<ResourceGraph | null>(null);
  const [pos, setPos] = useState<Pos[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [hover, setHover] = useState<string | null>(null);
  const [auto, setAuto] = useState(false);
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [view, setView] = useState({ tx: 0, ty: 0, k: 1 });
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ mode: 'pan' | 'node'; id?: string; lastX: number; lastY: number; moved: boolean } | null>(null);

  useEffect(() => { window.kn.cluster.status(session.id).then((r) => { if (r.ok) setNamespaces(r.data.namespaces); }); }, [session.id]);

  const load = async () => {
    setLoading(true); setError(undefined);
    try {
      const results = await Promise.all(MAP_KINDS.map((k) => window.kn.kube.list(session.id, k, ns)));
      const byKind: Record<string, RawKubeObject[]> = {};
      MAP_KINDS.forEach((k, i) => { const r = results[i]; byKind[k] = r.ok ? r.data : []; });
      const g = buildGraph(byKind);
      setGraph(g); setPos(layout(g.nodes, g.edges));
    } catch (e) { setError((e as Error).message); }
    setLoading(false);
  };
  useEffect(() => { void load(); }, [ns]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!auto) return; const t = setInterval(load, 15000); return () => clearInterval(t); }, [auto, ns]); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = useMemo(() => new Map(pos.map((p) => [p.id, p])), [pos]);
  const neighbors = useMemo(() => {
    if (!hover || !graph) return new Set<string>();
    const s = new Set<string>([hover]);
    for (const e of graph.edges) { if (e.source === hover) s.add(e.target); if (e.target === hover) s.add(e.source); }
    return s;
  }, [hover, graph]);

  const toVB = (clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (clientX - r.left) / r.width * W, y: (clientY - r.top) / r.height * H };
  };
  const onWheel = (e: React.WheelEvent) => {
    const { x, y } = toVB(e.clientX, e.clientY);
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const k = Math.max(0.3, Math.min(3, view.k * factor));
    setView({ k, tx: x - (x - view.tx) * k / view.k, ty: y - (y - view.ty) * k / view.k });
  };
  const startPan = (e: React.MouseEvent) => { const { x, y } = toVB(e.clientX, e.clientY); drag.current = { mode: 'pan', lastX: x, lastY: y, moved: false }; };
  const startNode = (e: React.MouseEvent, id: string) => { e.stopPropagation(); const { x, y } = toVB(e.clientX, e.clientY); drag.current = { mode: 'node', id, lastX: x, lastY: y, moved: false }; };
  const onMove = (e: React.MouseEvent) => {
    const d = drag.current; if (!d) return;
    const { x, y } = toVB(e.clientX, e.clientY); const dx = x - d.lastX, dy = y - d.lastY;
    if (Math.abs(dx) + Math.abs(dy) > 0.5) d.moved = true;
    d.lastX = x; d.lastY = y;
    if (d.mode === 'pan') setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
    else setPos((ps) => ps.map((p) => (p.id === d.id ? { ...p, x: p.x + dx / view.k, y: p.y + dy / view.k } : p)));
  };
  const endDrag = () => { drag.current = null; };

  return (
    <div className="mapview">
      <div className="content-bar">
        <h2 style={{ fontSize: 15 }}>Resource map</h2>
        <select className="input sm" style={{ width: 'auto' }} value={ns} onChange={(e) => setNs(e.target.value)}>
          {(namespaces.length ? namespaces : [ns]).map((n) => <option key={n}>{n}</option>)}
        </select>
        <button className="btn sm" onClick={load}>{loading ? 'Loading…' : 'Refresh'}</button>
        <label className="chk"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />Auto (15s)</label>
        <button className="btn sm" onClick={() => setView({ tx: 0, ty: 0, k: 1 })} title="Reset zoom/pan">Reset view</button>
        <span className="muted mono" style={{ marginLeft: 'auto', fontSize: 12 }}>{graph ? `${graph.nodes.length} objects · ${graph.edges.length} links` : ''}</span>
      </div>
      {error && <div className="alert" style={{ margin: '0 14px 8px' }}>{error}</div>}
      <div className="map-legend">
        {([['Pod', KIND_COLOR.Pod], ['Workload', '#56a8ff'], ['HPA', KIND_COLOR.HorizontalPodAutoscaler], ['Service', KIND_COLOR.Service], ['Ingress', KIND_COLOR.Ingress], ['NetPol', KIND_COLOR.NetworkPolicy], ['Config', KIND_COLOR.ConfigMap]] as [string, string][]).map(([k, c]) => (
          <span key={k} className="mono" style={{ fontSize: 11 }}><span className="lg-dot" style={{ background: c }} />{k}</span>
        ))}
        <span className="muted" style={{ fontSize: 11, marginLeft: 8 }}>scroll to zoom · drag to pan · drag a node to move</span>
      </div>
      <div className="map-canvas">
        {graph && graph.nodes.length === 0 && !loading && <div className="muted" style={{ padding: 30, textAlign: 'center' }}>No objects in {ns}.</div>}
        {graph && graph.nodes.length > 0 && (
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ display: 'block', cursor: drag.current?.mode === 'pan' ? 'grabbing' : 'grab' }}
            onWheel={onWheel} onMouseDown={startPan} onMouseMove={onMove} onMouseUp={endDrag} onMouseLeave={endDrag}>
            <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
              {graph.edges.map((e, i) => {
                const a = byId.get(e.source), b = byId.get(e.target); if (!a || !b) return null;
                const dim = hover && !(neighbors.has(e.source) && neighbors.has(e.target));
                return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={EDGE_COLOR[e.kind]} strokeWidth={e.kind === 'owns' ? 1 : 1.4} opacity={dim ? 0.06 : 0.7} />;
              })}
              {pos.map((n) => {
                const dim = hover && !neighbors.has(n.id);
                const color = KIND_COLOR[n.kind] ?? '#8b94a7';
                const r = n.kind === 'Pod' ? 9 : /Deployment|StatefulSet|DaemonSet|ReplicaSet/.test(n.kind) ? 11 : 8;
                return (
                  <g key={n.id} transform={`translate(${n.x},${n.y})`} opacity={dim ? 0.2 : 1} style={{ cursor: 'pointer' }}
                    onMouseDown={(e) => startNode(e, n.id)}
                    onMouseEnter={() => !drag.current && setHover(n.id)} onMouseLeave={() => setHover(null)}
                    onClick={() => { if (!drag.current?.moved && n.resourceId) setDetails({ resourceId: n.resourceId, namespace: n.namespace, name: n.name, uid: n.id }); }}>
                    {n.status && <circle r={r + 3} fill="none" stroke={STATUS_RING[n.status]} strokeWidth={1.5} />}
                    <circle r={r} fill={color} />
                    <text y={r + 12} textAnchor="middle" fontSize={10.5} fill="#c7cdd8" fontFamily="var(--mono)">{n.name.length > 22 ? n.name.slice(0, 21) + '…' : n.name}</text>
                  </g>
                );
              })}
            </g>
          </svg>
        )}
      </div>
    </div>
  );
}
