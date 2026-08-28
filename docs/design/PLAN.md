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

## Slice 2 — Investigation Cases  ✅
- [x] Store: pure-TS JSON store under userData (cases, findings, comments, evidence-meta, events,
      action_log) + evidence blobs SHA-256'd on disk. (Chosen over better-sqlite3 to keep the
      zero-native-dependency portable packaging; same interface, migratable later.)
- [x] Findings (severity/status + rollup); timeline (case events + folded-in action log); evidence
      (pinned YAML / log snippets / notes / window screenshots) with delete; HTML + JSON report
      (self-contained, inline screenshots) with in-app preview + export.
- [x] Cluster→case integration: "Pin to case" from the YAML drawer and log panels; a case picker;
      "Cases" view over the cluster IDE. Tests: rollup (4). typecheck + build green; verified via mock bridge.
- [x] **Investigation Tools** view (DockerLens carry-over): Base64, JWT decoder, hash, URL, timestamp,
      JSON format, CIDR calc (renderer-pure) + DNS lookup & TLS certificate check (main-process
      `dns`/`tls`). Each result pins to a case as evidence. Tests: pure tools (6).
- [x] **Forensic HAR analyzer** (DockerLens-style): file drop, Overview/Requests/Errors/Performance/
      Auth-Flow/Security tabs, per-request risk scoring + expandable payload/response previews,
      aggregated security findings (secrets-in-URL, Basic auth, insecure cookies, mixed content,
      missing HSTS/CSP), and auth-flow reconstruction. Pins the summary to a case. Tests: analyzer (5).
- [x] **JWT inspector**: header chips + claim table w/ expiry countdown, decoded header/payload,
      signature (unverified), and a security-analysis panel (alg:none, symmetric HMAC, expired,
      no-exp, not-yet-valid, long-lived, missing iss/aud). Pure. Tests (4).
- [x] **Certificate inspector**: Host:port (TLS chain via `getPeerCertificate(true)`) or paste-PEM
      (`X509Certificate`); real key type/bits, signature-alg from the DER, self-signed + chain;
      findings (expired/expiring, weak sig, short key, self-signed, hostname mismatch, long validity,
      wildcard) computed renderer-side. Tests (4).

## Slice 3 — Observability  ⏸ deferred to v2
- Prometheus PromQL + Loki LogQL panels (configured endpoints); inline pod/node metric sparklines.

## Slice 4 — Resource map + Helm  ✅
- [x] Resource map: per-namespace topology graph (ownerRef chains, Service→Pod selection,
      Ingress→Service routes, Pod→PVC/ConfigMap/Secret mounts) built pure (tested), laid out with a
      self-contained force sim (no graph lib) and rendered to SVG with status rings; click → details.
- [x] Helm (full): bundled `helm` binary (`resources/bin`, fetched via scripts/fetch-helm.mjs) run
      against a transient, locked STS-token kubeconfig (deleted after). List / history / values /
      manifest (read) + rollback / upgrade / install / uninstall (write, each writes the action log).
      HelmView with release list + history/values/manifest tabs and actions.
- [x] Verify: 41 tests (graph builder + prior); typecheck + build green; both views driven via the
      mock bridge. Live Helm run needs a real cluster + the bundled binary.

## v1.1 — functional-gap pass  ✅
- [x] **Multi-cluster**: hold many connected clusters; titlebar cluster switcher (switch / disconnect /
      add without dropping others); per-cluster view state resets on switch.
- [x] **Core IDE depth**: container picker on logs/exec; log controls (previous + tail); rich per-kind
      details (pods/workloads/services/ingress/configmap/secret/pvc/node); reveal-secret decode.
- [x] **Cases depth**: comments tab (case- or finding-scoped); cross-case search; timeline scoped to
      actions since the case opened; line-pinned log snippets (pins the selection).
- [x] **Helm depth**: namespace filter; install/upgrade modal with a values YAML editor; `helm repo add`
      + chart search.
- [x] **Resource map depth**: auto-refresh (15s); zoom / pan / node-drag; HPA→workload, PVC→PV and
      NetworkPolicy→pod edges. Tests: graph builder (3).

## Deferred to v2
- Observability (Prometheus PromQL + Loki LogQL panels + sparklines).

## Later (post-MVP)
Node shell; extension system; code-signing + notarization + auto-update; non-EKS providers.
