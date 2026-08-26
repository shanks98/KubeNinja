# KubeNinja — Implementation Plan (vertical slices)

Each slice is independently runnable and verifiable. Build order:

## Slice 0 — Shell & connect  ✅ (this milestone)
- [x] Project scaffold: electron-vite + electron-builder, React 19 + TS, TanStack Query + Zustand.
- [x] Main: AWS EKS list/describe; **EKS STS bearer-token minter** (SigV4 presign) with unit test.
- [x] Main: in-memory session store (creds/token never on disk; re-mint before expiry).
- [x] Main: `@kubernetes/client-node` cluster status (version/nodes/namespaces) + list pods.
- [x] Typed IPC bridge (`window.kn`); preload with `contextIsolation`.
- [x] Renderer: shinobi theme; Connect view (paste creds → scan region → pick cluster); Cluster
      shell (status strip + namespace picker + pods table).
- [ ] Verify: `npm test`, `npm run typecheck`, `npm run build` green. (GUI run needs a display.)

## Slice 1 — Core IDE
- Resource browser: KubeObject base + per-kind subclasses (curated ~25) + CRD discovery; per-kind
  columns; namespace scope; **live watches** streamed over IPC.
- Details drawer: Overview (health), YAML (CodeMirror view/edit/apply), Events.
- Pod **Logs** (follow/search), **Live Logs** (tail on-disk file in container), **Trace** (log4j
  level change + auto-revert, flag-gated), **exec** terminal (xterm over client-node Exec).
- Workload actions: restart / scale / cordon / drain / delete / reveal — each writes the action log.

## Slice 2 — Investigation Cases
- SQLite (`better-sqlite3`) store: cases, findings, comments, evidence-meta, `action_log`.
- Findings (severity/status + rollup); timeline (action log + case events); evidence (log viewer
  excerpt/full/search, line-pin snippets, screenshots); notes; HTML/JSON report.

## Slice 3 — Observability
- Prometheus PromQL + Loki LogQL panels (configured endpoints); inline pod/node metric sparklines.

## Slice 4 — Resource map + Helm
- Cluster topology graph (owner refs + Service/Ingress/PVC edges).
- Helm releases (list/history/rollback/upgrade/install-from-URL) via a bundled `helm` binary + a
  transient temp kubeconfig.

## Later (post-MVP)
Node shell; extension system; code-signing + notarization + auto-update; non-EKS providers.
