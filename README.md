# KubeNinja 🥷

[![CI](https://github.com/shanks98/KubeNinja/actions/workflows/ci.yml/badge.svg)](https://github.com/shanks98/KubeNinja/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-2dd4a7.svg)](LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-2dd4a7.svg)](CONTRIBUTING.md)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-555.svg)

A single-user, cross-platform **Kubernetes / EKS operations & investigation desktop IDE**
(Electron). It combines Lens-grade cluster work with a built-in investigation suite — cases,
findings, evidence, a local timeline — and connects to **EKS with short-lived AWS session
credentials held in memory only** (a presigned STS token; no kubeconfig on disk).

> Status: **v0.2.0** — MVP complete. Multi-cluster resource browser (YAML, logs/live/trace,
> exec, workload actions), investigation Cases + a forensic tools suite (Base64/JWT/HAR/DNS/
> cert/hash/…), a resource-topology map, and full Helm (list/history/rollback/upgrade/install).
> Observability (Prometheus/Loki) is deferred to v2. Milestone plan in
> [`docs/design/PLAN.md`](docs/design/PLAN.md); design in [`docs/design/SPEC.md`](docs/design/SPEC.md).

## Features

- **Multi-cluster** — connect several EKS clusters at once and switch from the titlebar.
  Connected clusters are **remembered across restarts** (metadata only — never credentials);
  on relaunch they're listed on Welcome, and pasting credentials once reconnects any of them.
- **Resource browser** — ~20 kinds, live via watches, per-kind columns, YAML view/edit/apply,
  rich per-kind details, reveal-secret.
- **Pods** — logs (container picker, previous, tail), live file tail, log-level trace, exec shell.
- **Actions** — restart / scale / cordon / drain (evict) / delete — each written to a local audit log.
- **Investigation Cases** — findings with severity rollup, a timeline fed by the audit log,
  evidence (pinned YAML / log snippets / notes / screenshots), and an HTML/JSON report.
- **Tools** — Base64, JWT decoder, forensic HAR analyzer, DNS lookup, certificate inspector,
  hash, URL, timestamp, JSON, CIDR. Results pin to a case.
- **Resource map** — a force-directed topology graph (owner refs, Service/Ingress/PVC/HPA/NetPol edges).
- **Helm** — releases, history, values, manifest, and rollback / upgrade / install / uninstall.

---

## Install & run

**Requirements:** [Node.js](https://nodejs.org) **20+** and Git. (Windows for the prebuilt portable
app; macOS/Linux are supported from source.)

### Option A — run the packaged Windows app (no install)

The portable build is a self-contained folder — no installer, nothing written to Program Files.

1. Get the `KubeNinja-win-x64` folder (build it with Option B's `npm run pack:portable`, or copy a
   prebuilt `dist/KubeNinja-win-x64/` folder).
2. Double-click **`KubeNinja.exe`** inside it.
3. It's unsigned, so Windows SmartScreen may warn on first launch — choose **More info → Run anyway**.

The whole folder is portable: copy it to a USB stick or another machine and it runs as-is.

### Option B — build & run from source

**Windows — one-command setup.** From the KubeNinja folder, double-click **`install.cmd`** (or run
`powershell -ExecutionPolicy Bypass -File install.ps1`). It checks for **Node.js 20+** and the
**helm** binary, installs only what's missing (Node via `winget`), runs `npm install`, and prints the
next command. Re-running it is safe.

**Manual** (any OS):

```bash
git clone https://github.com/shanks98/KubeNinja.git
cd KubeNinja
npm install

# (optional) bundle the helm binaries so Helm actions work — see "Helm" below
node scripts/fetch-helm.mjs

npm run dev            # launch with hot reload (development)
# — or —
npm run pack:portable  # build a standalone app → dist/KubeNinja-win-x64/KubeNinja.exe
```

`npm run dev` opens the app with live reload. `npm run pack:portable` produces the portable folder
from Option A.

> **Windows / PowerShell notes.**
>
> **"The term 'npm' is not recognized…"** (or the same for `node`) → **Node.js is not installed, or
> not on your PATH.** npm ships *with* Node — install the **LTS (20+)** from
> [nodejs.org](https://nodejs.org), then **close and reopen** the terminal (PATH is read at shell
> start) and verify:
> ```powershell
> node -v      # should print v20.x or newer
> npm -v
> ```
> Only after both print a version does `npm install` work.
>
> **"running scripts is disabled on this system"** (execution policy, *different* error) → do **one** of:
> - allow signed scripts for your user (recommended): `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, then `npm install`
> - call the shim directly: `npm.cmd install`
> - run it through cmd: `cmd /c "npm install"`
>
> The command is always plain `npm install` — not `cmd.npm install`. Downloading the repo as a ZIP is
> fine: unzip it, `cd` into the folder, then run the commands above.

### First connect

KubeNinja never reads a kubeconfig — you paste **AWS session credentials** and it mints an EKS
token in memory.

1. On the Welcome screen, click **Connect a cluster** (or **File → Add cluster…**, `Ctrl+N`).
2. Paste your **AWS Access Key ID**, **Secret**, and (for assumed/SSO roles) **Session Token**,
   pick the **region**, then **Scan for EKS clusters** and choose one.
   - Or use **By command** and paste an `aws eks update-kubeconfig --name … --region …` line.
   - For LocalStack/MiniStack, set the optional **AWS endpoint**.
3. Add more clusters anytime from the titlebar switcher; switch or disconnect there.

Credentials and tokens live only in the main process's memory and are scrubbed on disconnect/exit.

---

## Develop

```bash
npm install
npm run dev            # launch the app with hot reload
npm test               # unit tests (STS token, resource paths, tools, graph, …)
npm run typecheck      # tsc for main + preload + renderer
npm run build          # bundle main + preload + renderer
npm run pack:portable  # standalone Windows app → dist/KubeNinja-win-x64/KubeNinja.exe
npm run dist           # platform installer (nsis / dmg / AppImage) — see note
```

`npm run pack:portable` bundles the main process and hand-assembles the Electron runtime, so it
sidesteps electron-builder's signing-tool cache, which won't extract on Windows without the
symbolic-link privilege. For the full `npm run dist` installers (nsis/dmg/AppImage), enable
**Developer Mode** (or run elevated) so that cache can unpack.

### Helm

Helm actions require a `helm` binary. `node scripts/fetch-helm.mjs` downloads the official Helm
binaries into `resources/bin/` (git-ignored); `pack:portable` then bundles `helm.exe` into the app
(`resources/bin/helm.exe`). Without it, the **Helm** view degrades gracefully to "unavailable".

## How it connects

KubeNinja never reads a kubeconfig. You paste AWS session credentials; the **main process** mints
an EKS bearer token by presigning an STS `GetCallerIdentity` request (SigV4, with the
`x-k8s-aws-id` cluster header as a signed header) and talks to the cluster's API server directly
via `@kubernetes/client-node`. Credentials and tokens live only in the main process's memory and
are scrubbed on disconnect / exit; tokens are re-minted transparently before expiry.

## Architecture (short)

`src/main` (Node) owns AWS + Kubernetes + Helm + local storage and exposes a typed IPC bridge;
`src/preload` publishes `window.kn`; `src/renderer` (React) is pure UI with `contextIsolation`
on. See the spec for the full picture and the vertical-slice plan.

## Contributing

KubeNinja is open source and **community contributions are very welcome** — it's
young and there's plenty of high-impact work to do (multi-cloud beyond EKS,
observability panels, signed builds, more tests). Start with
**[CONTRIBUTING.md](CONTRIBUTING.md)** for setup, the architecture in 60 seconds,
and the one rule that matters most: **credentials and tokens never touch disk and
never leave the main process.**

- 🐛 Found a bug or have an idea? [Open an issue](https://github.com/shanks98/KubeNinja/issues/new/choose).
- 💬 Questions or proposals? Use [Discussions](https://github.com/shanks98/KubeNinja/discussions).
- 🔒 Security issue? Please report it [privately](SECURITY.md), not as a public issue.
- 🤝 Be excellent to each other — see the [Code of Conduct](CODE_OF_CONDUCT.md).

Good first areas are listed in [CONTRIBUTING.md](CONTRIBUTING.md#roadmap--good-places-to-start)
and issues labelled `good first issue`.

## Credits

An independent implementation. Design and architecture patterns are informed by
**[Freelens](https://github.com/freelensapp/freelens)** (MIT) and the Lens lineage, and by the
author's own **DockerLens**. KubeNinja shares no code with them.

## License

[MIT](LICENSE) © 2026 shanks98 and the KubeNinja contributors.
