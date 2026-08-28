// Turn raw @kubernetes/client-node errors into messages a user can act on.
// The most common real-EKS failure is a 401: the AWS identity authenticates to
// AWS fine (so connect/describe works) but isn't granted Kubernetes access on the
// cluster (aws-auth ConfigMap / EKS Access Entry), so every API call is rejected.

function status(err: unknown): number | undefined {
  const e = err as { code?: unknown; statusCode?: unknown; response?: { statusCode?: unknown } };
  const c = e?.code ?? e?.statusCode ?? e?.response?.statusCode;
  return typeof c === 'number' ? c : undefined;
}

export function isAuthError(err: unknown): boolean {
  const s = status(err);
  return s === 401 || /unauthorized/i.test((err as { message?: string })?.message ?? '');
}

export function friendlyError(err: unknown): { message: string; code?: string } {
  const e = err as { message?: string; code?: unknown };
  const msg = e?.message ?? String(err);
  const s = status(err);

  if (s === 401 || /unauthorized/i.test(msg)) {
    return {
      code: '401',
      message: 'Unauthorized — the cluster rejected this AWS identity. The credentials work with AWS, but the IAM principal is not granted Kubernetes access on this cluster (aws-auth ConfigMap / EKS Access Entry). Connect with the identity you use for kubectl on this cluster, or add an EKS access entry for it.',
    };
  }
  if (s === 403 || /forbidden/i.test(msg)) {
    return { code: '403', message: `Forbidden — authenticated, but your RBAC role isn't allowed to do this. ${msg}` };
  }
  return { message: msg, code: s != null ? String(s) : undefined };
}
