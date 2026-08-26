# KubeNinja 🥷

A single-user, cross-platform **Kubernetes / EKS operations & investigation desktop IDE**
(Electron). It combines Lens-grade cluster work with a built-in investigation suite — cases,
findings, evidence, a local timeline — and connects to **EKS with short-lived AWS session
credentials held in memory only** (a presigned STS token; no kubeconfig on disk).

> Status: **early — Slice 0** (bootable shell + EKS connect + cluster status + pods). The
> milestone plan is in [`docs/design/PLAN.md`](docs/design/PLAN.md); the design in
> [`docs/design/SPEC.md`](docs/design/SPEC.md).

## Develop

```bash
npm install
npm run dev          # launch the app with hot reload
npm test             # unit tests (STS token minting, …)
npm run typecheck    # tsc for main + renderer
npm run build        # bundle main + preload + renderer
npm run pack:dir     # unpacked desktop build (no installer)
npm run dist         # platform installer (nsis / dmg / AppImage)
```

Requires Node 20+.

## How it connects

KubeNinja never reads a kubeconfig. You paste AWS session credentials; the **main process**
mints an EKS bearer token by presigning an STS `GetCallerIdentity` request (SigV4, with the
`x-k8s-aws-id` cluster header as a signed header) and talks to the cluster's API server directly
via `@kubernetes/client-node`. Credentials and tokens live only in the main process's memory and
are scrubbed on disconnect / exit; tokens are re-minted transparently before expiry.

## Architecture (short)

`src/main` (Node) owns AWS + Kubernetes + local storage and exposes a typed IPC bridge;
`src/preload` publishes `window.kn`; `src/renderer` (React) is pure UI with `contextIsolation`
on. See the spec for the full picture and the vertical-slice plan.

## Credits

An independent implementation. Design and architecture patterns are informed by
**[Freelens](https://github.com/freelensapp/freelens)** (MIT) and the Lens lineage, and by the
author's own **DockerLens**. KubeNinja shares no code with them.

## License

MIT
