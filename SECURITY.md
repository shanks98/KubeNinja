# Security Policy

KubeNinja is a security-sensitive tool — it handles AWS credentials and talks to
production Kubernetes clusters — so we take reports seriously.

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Report privately through GitHub's **[Report a vulnerability](https://github.com/shanks98/KubeNinja/security/advisories/new)**
(Security → Advisories → Report a vulnerability). We'll acknowledge within a few
days, work with you on a fix, and credit you in the release notes unless you'd
rather stay anonymous.

If you can, include: what you found, how to reproduce it, the affected version /
commit, and the impact.

## What's in scope

- **Credential / token handling** — anything that could cause AWS credentials or a
  minted STS token to be written to disk, logged, leaked to the renderer, or sent
  off-machine.
- **The IPC bridge** (`src/preload`) — a way for renderer code to reach Node,
  Electron internals, or secrets it shouldn't.
- **Token minting** (`src/main/aws/token.ts`) — signing flaws or over-broad tokens.
- **Cluster mutations** — YAML apply / delete / drain reaching resources they
  shouldn't, or bypassing the action log.

## Design invariants (the intended threat model)

KubeNinja is a **single-user desktop app**. By design:

- AWS credentials and STS tokens live **only in the main process's memory**, are
  scrubbed on disconnect/exit, and never touch disk.
- **No kubeconfig** is read or written; **no telemetry** is collected.
- Persisted state (`userData/kubeninja/`) is **metadata only** — cluster
  name/region/endpoint/CA and investigation cases — never credentials.

A report that shows any of these invariants being violated is a valid
vulnerability, even without a further exploit.

## Out of scope

- The security of the AWS credentials you paste in (that's between you and AWS —
  use short-lived session credentials).
- Whatever your Kubernetes RBAC permits your identity to do.
- Unsigned-binary SmartScreen warnings (a known gap tracked on the roadmap).
