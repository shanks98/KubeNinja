# KubeNinja — Design Spec

**KubeNinja** is a cross-platform (Windows / macOS / Linux) **Electron desktop app** — a
single-user Kubernetes / EKS **operations & investigation IDE**. It combines Freelens-grade
cluster work with DockerLens's investigation suite, connecting to EKS with **pasted, in-memory
session credentials** (presigned STS token — no kubeconfig on disk). It is an independent
implementation; it credits **Freelens (MIT)** and the Lens lineage, and the author's DockerLens.

## Decisions (locked)

| Question | Decision |
|---|---|
| Architecture | **Pure desktop, single-user** — all logic in the Electron app |
| Cluster auth | **Session creds / EKS-STS** — pasted AWS creds, held in memory only; presigned STS bearer token |
| Build base | **Fresh Electron app** (draws on Freelens patterns + DockerLens code, no fork) |
| Local audit | **Yes** — a local action log feeds the Cases timeline |
| Theme | **New "shinobi" identity** — cool near-black + electric jade; ninja logo |
| Multi-user / RBAC / audit-server / approvals / web server / JWT | **Dropped** (single-user desktop; the cluster's own RBAC still applies) |

## Architecture

**No proxy binary, no DI framework.** Lens/Freelens need a bundled auth-proxy + two-tier HTTPS
proxy because they resolve kubeconfig exec/OIDC/cert auth. KubeNinja authenticates with a plain
`Authorization: Bearer <STS token>`, so the **main process talks to the EKS API server directly**
via `@kubernetes/client-node` with an in-memory config (server URL + CA + bearer token).

- **Main process (Node / TypeScript)** — all privilege & network:
  - `aws/` — AWS SDK v3 `client-eks` (list/describe → endpoint + CA); SigV4 presign (`@smithy/signature-v4`) to mint the EKS token `k8s-aws-v1.<base64url(presigned GetCallerIdentity URL, header x-k8s-aws-id)>`.
  - `kube/` — `@kubernetes/client-node` clients per cluster (in-memory `KubeConfig`); API discovery for kinds + CRDs; list/get/apply/delete; **watches** streamed to the renderer.
  - `exec/` — pod exec via client-node `Exec` (WS to the exec subresource) bridged to xterm; logs via follow-stream; **Live Logs** (`tail -f` an on-disk file in a container); **Trace** (log4j level changes, auto-revert — flag-gated / JVM).
  - `helm/` — bundled `helm` binary invoked with a transient, locked temp kubeconfig, deleted after the call.
  - `obs/` — Prometheus / Loki fetch (configured endpoints).
  - `store/` — `better-sqlite3` at `userData/kubeninja.db` (cases, findings, comments, evidence-meta, **action_log**); evidence bytes under `userData/evidence` (SHA-256'd).
  - `ipc/` — typed request/response bridge + streaming channels (logs/exec/watch).
- **Renderer (React 19 + Vite + TS)** — UI only; `contextIsolation` on, no Node. State = **TanStack Query** (over IPC) + **Zustand** (UI). Kube model = a `KubeObject` base + per-kind subclasses with static `apiBase` (Freelens pattern); curated ~25 kinds + runtime CRD discovery.
- **Security** — creds never written to disk; only transient touch is the helm kubeconfig (locked perms, deleted); CSP; no `nodeIntegration` in the renderer.

## Local data & the action log

SQLite holds the investigation store and an **`action_log`** row for every mutating op
(restart/scale/delete/cordon/drain/reveal/apply). The action log **replaces DockerLens's server
audit ledger** and feeds the Cases **timeline**. Reports export HTML / JSON locally.

## Feature scope (MVP), as vertical slices

- **Slice 0 — Shell & connect.** Bootable Electron app (shinobi theme); connect flow (paste AWS
  creds + region → list EKS clusters → pick → in-memory STS token → verify via cluster version /
  nodes / namespaces). Packaging skeleton (electron-vite → electron-builder; unsigned dev builds).
- **Slice 1 — Core IDE.** Resource browser (curated kinds + CRD discovery, per-kind columns,
  namespaces, live via watches), details drawer (YAML view/edit/apply), pod **Logs / Live Logs /
  Trace**, pod **exec** terminal (xterm), workload actions (restart/scale/cordon/drain/delete/
  reveal) → each writes the action log.
- **Slice 2 — Investigation Cases.** Local case store; findings (severity/status + rollup),
  timeline (action log + case events), evidence (log viewer excerpt/full/search, line-pin
  snippets, screenshots), notes, HTML/JSON report.
- **Slice 3 — Observability.** Prometheus PromQL + Loki LogQL panels + inline pod/node metric sparklines.
- **Slice 4 — Resource map + Helm.** Cluster topology graph (net-new — owner refs + Service/Ingress/PVC edges) and Helm releases (list/history/rollback/upgrade/install-from-URL).

## Tech stack

Electron + electron-vite + electron-builder (nsis/portable, dmg, AppImage) · React 19 · TypeScript ·
`@kubernetes/client-node` · AWS SDK v3 (`client-eks`, `@smithy/signature-v4`, `@aws-crypto/sha256-js`) ·
`better-sqlite3` (Slice 2+) · `@xterm/xterm` (Slice 1) · `recharts` (Slice 3) · CodeMirror 6 (Slice 1) ·
a force-graph lib (Slice 4) · TanStack Query + Zustand · bundled `helm` (Slice 4).

## Non-goals

Multi-user, teams, RBAC policies, approval workflow, invites/SMTP, owner break-glass, the web
server, JWT, iframe dashboard proxy, multi-user session recording, the extension system (deferred),
node-shell (deferred).
