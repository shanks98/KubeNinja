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

## Slice 1 — Core IDE  ✅
- [x] Resource browser: `KubeObject` wrapper + per-kind column registry (curated ~20 kinds);
      per-kind columns; namespace scope; **live watches** streamed over IPC (uid-keyed, timer-batched).
- [x] Details drawer: Overview (metadata/labels/owner/conditions), YAML (CodeMirror 6 view/edit/apply
      via server replace), Events.
- [x] Pod **Logs** (real follow stream + search/download), **Live Logs** (`tail -F` a file via exec),
      **Trace** (JVM actuator log-level change + auto-revert, experimental), **exec** terminal
      (xterm over client-node `Exec`, with resize).
- [x] Workload actions: restart / scale / cordon / drain / delete — each writes the action log.
- [x] Verify: `npm test` (16), `npm run typecheck`, `npm run build` green; UI driven through a mock
      IPC bridge (table/drawer/YAML/dock/exec/trace/action-log). Live cluster run pending a real EKS target.

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
