import { SignatureV4 } from '@smithy/signature-v4';
import { HttpRequest } from '@smithy/protocol-http';
import { Sha256 } from '@aws-crypto/sha256-js';
import type { AwsCreds } from '@shared/types';

const CLUSTER_HEADER = 'x-k8s-aws-id';
// STS presign TTL (seconds) = the token's *actual* validity window. This is the max
// aws-iam-authenticator accepts (15m) and matches what aws-iam-authenticator / eksctl
// / the Go SDK use. It MUST cover the session's token-reuse window (see session.ts,
// which re-mints ~12m in) AND leave slack for client/STS clock skew — a short window
// (e.g. 60s) makes every call after it, and any skewed clock, fail cluster auth with 401.
const EXPIRES = 900;

function base64UrlNoPad(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Mint an EKS API bearer token from AWS credentials, the way aws-iam-authenticator
 * does: presign an STS GetCallerIdentity GET with SigV4, forcing the cluster-name
 * header into the *signed* headers (not hoisted to the query), then wrap the URL as
 * `k8s-aws-v1.<base64url(url)>`. Purely in-memory; the token is short-lived.
 */
export async function eksBearerToken(creds: AwsCreds, clusterName: string): Promise<{ token: string; expiresAt: number }> {
  // Real AWS uses regional STS; a custom endpoint (LocalStack / MiniStack) fronts
  // STS at its own host, and the cluster's authenticator validates the token
  // against that same host, so the presigned URL must point there.
  let protocol = 'https:';
  let hostname = `sts.${creds.region}.amazonaws.com`;
  let port: number | undefined;
  if (creds.endpoint) {
    const u = new URL(creds.endpoint);
    protocol = u.protocol;
    hostname = u.hostname;
    port = u.port ? Number(u.port) : undefined;
  }
  const host = port ? `${hostname}:${port}` : hostname;

  const signer = new SignatureV4({
    service: 'sts',
    region: creds.region,
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
    },
    sha256: Sha256,
    applyChecksum: false,
  });

  const request = new HttpRequest({
    method: 'GET',
    protocol,
    hostname,
    ...(port ? { port } : {}),
    path: '/',
    query: { Action: 'GetCallerIdentity', Version: '2011-06-15' },
    headers: { host, [CLUSTER_HEADER]: clusterName },
  });

  const presigned = await signer.presign(request, {
    expiresIn: EXPIRES,
    // Keep the cluster header a *signed header*, never hoisted to the query string.
    signableHeaders: new Set([CLUSTER_HEADER]),
    unhoistableHeaders: new Set([CLUSTER_HEADER]),
  });

  const qs = Object.entries(presigned.query ?? {})
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  const url = `${protocol}//${host}${presigned.path}?${qs}`;

  return {
    token: 'k8s-aws-v1.' + base64UrlNoPad(url),
    // Re-mint a minute before the 15m presign actually expires (session.get re-mints
    // ~2m before this), so a fresh, unexpired token is always used for cluster calls.
    expiresAt: Date.now() + 14 * 60 * 1000,
  };
}

/** Decode a token back to its STS URL — used by tests and diagnostics. */
export function decodeToken(token: string): string {
  const b64 = token.replace(/^k8s-aws-v1\./, '').replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64').toString('utf8');
}
