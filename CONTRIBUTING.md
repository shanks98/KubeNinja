# Contributing to KubeNinja 🥷

Thanks for wanting to help KubeNinja grow! It's a single-user, cross-platform
Kubernetes/EKS **operations & investigation** desktop IDE, and it's still young —
there's a lot of room to make it better. This guide gets you from clone to pull
request.

## Table of contents

- [Ways to help](#ways-to-help)
- [Development setup](#development-setup)
- [Before you open a PR](#before-you-open-a-pr)
- [The one rule that matters most: the security model](#the-security-model-please-read)
- [Architecture in 60 seconds](#architecture-in-60-seconds)
- [Coding style](#coding-style)
- [Commit & PR conventions](#commit--pr-conventions)
- [Roadmap / good places to start](#roadmap--good-places-to-start)

## Ways to help

You don't have to write code to be useful:

- **Try it on a real cluster** and file bugs — especially edge cases in EKS auth,
  large clusters, and unusual resource kinds.
- **Improve docs** — the README, this guide, inline comments.
- **Triage issues** — reproduce, add detail, suggest fixes.
- **Pick up code** — see the [roadmap](#roadmap--good-places-to-start) and issues
  labelled `good first issue` / `help wanted`.

## Development setup

**Prerequisites:** [Node.js](https://nodejs.org) **20+**. That's it — KubeNinja
talks to the EKS API directly, so there's no kubectl, no local AWS CLI, and no
kubeconfig involved.

```bash
git clone https://github.com/shanks98/KubeNinja.git
cd KubeNinja
npm install
npm run dev            # launch the app with hot reload
```

On Windows you can instead double-click `install.cmd` (or run
`powershell -ExecutionPolicy Bypass -File install.ps1`), which installs Node if
missing, runs `npm install`, and fetches the bundled Helm binary.

**Helm actions** need a `helm` binary — run `node scripts/fetch-helm.mjs` once to
download it into `resources/bin/` (git-ignored). Without it the Helm view simply
degrades to "unavailable"; everything else works.

## Before you open a PR

All three of these must pass — CI runs them on every PR:

```bash
npm run typecheck     # tsc for main + preload + renderer
npm test              # vitest unit tests
npm run build         # electron-vite bundle
```

If you changed behaviour, add or update a test. If you changed something that
shows in the UI, include a screenshot in the PR.

## The security model (please read)

KubeNinja's whole reason to exist is that **it never puts credentials or cluster
tokens on disk, and they never leave the main process.** This is the one invariant
every contribution must preserve:

- AWS credentials and minted STS tokens live **only** in the main process's memory
  (`src/main/session.ts`), are scrubbed on disconnect/exit, and are **never**
  written to a file, an env var, logged, or sent over the IPC bridge to the renderer.
- The renderer (`src/renderer`) runs with `contextIsolation` on and only ever sees
  the typed `window.kn` surface — never raw Node, Electron, creds, or tokens.
- Persisted data (cluster profiles in `userData/kubeninja/`) is **metadata only**
  (name/region/endpoint/CA) — never secrets.

If your change needs to touch auth, tokens, or the IPC boundary, call it out
explicitly in the PR so it gets a careful review.

## Architecture in 60 seconds

```
src/main      Node — owns AWS + Kubernetes + Helm + local JSON store; registers
              the typed IPC handlers. Talks to the EKS API server directly via
              @kubernetes/client-node with an in-memory config (no proxy binary).
src/preload   The contextIsolation bridge — publishes window.kn and nothing else.
src/shared    Types shared across all three (no Node/Electron imports).
src/renderer  React 19 UI (TanStack Query + Zustand). Pure UI; no Node access.
```

EKS auth: the main process presigns an STS `GetCallerIdentity` request (SigV4,
with `x-k8s-aws-id` as a signed header) into a `k8s-aws-v1.` bearer token — the
aws-iam-authenticator scheme — entirely in memory. See `src/main/aws/token.ts`.

## Coding style

- **TypeScript, strict.** No new `any` where a real type fits.
- **Match the surrounding code** — its naming, its comment density, its idioms.
  Comments explain *why*, not *what*.
- **Don't add a dependency** without raising it in an issue first — a lean tree is
  a feature here.
- Keep files focused; if one grows past its purpose, that's a signal to split it.

## Commit & PR conventions

- Use [Conventional Commits](https://www.conventionalcommits.org): `feat:`, `fix:`,
  `docs:`, `refactor:`, `test:`, `chore:` … with an optional scope, e.g.
  `feat(clusters): remember connected clusters across restarts`.
- One logical change per PR; keep the diff reviewable.
- Fill in the PR template. Link the issue it closes.
- Be kind in review — see the [Code of Conduct](CODE_OF_CONDUCT.md).

## Roadmap / good places to start

The biggest opportunities (see [`docs/design/PLAN.md`](docs/design/PLAN.md) for the
full picture):

- **Beyond EKS-only** — a kubeconfig/exec fallback, or GKE/AKS connectors. This is
  the single biggest lever on who can use KubeNinja.
- **Observability** — Prometheus / Loki panels and inline pod/node sparklines
  (deferred from the MVP).
- **Signed builds + mac/Linux packaging** — so users don't hit SmartScreen and the
  install matches the "security-first" promise.
- **CRD discovery**, JSON-patch YAML apply, richer HAR/JWT/cert tooling.
- **Tests** — component and end-to-end coverage is thin; more is always welcome.

Not sure where to start? Open a discussion or comment on an issue and we'll help
you find something that fits.
