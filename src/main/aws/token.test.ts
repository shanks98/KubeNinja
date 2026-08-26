import { describe, it, expect } from 'vitest';
import { eksBearerToken, decodeToken } from './token';

const creds = {
  accessKeyId: 'AKIAEXAMPLE0000000000',
  secretAccessKey: 'wJalrXUtnFEMIexampleKEY0000000000000000',
  sessionToken: 'FQoGZXIvYXdzEXAMPLE',
  region: 'ap-south-1',
};

describe('eksBearerToken', () => {
  it('produces a k8s-aws-v1 token that decodes to a signed STS presigned URL', async () => {
    const { token, expiresAt } = await eksBearerToken(creds, 'prod-eks');
    expect(token.startsWith('k8s-aws-v1.')).toBe(true);
    expect(expiresAt).toBeGreaterThan(Date.now());

    const url = decodeToken(token);
    expect(url).toContain('sts.ap-south-1.amazonaws.com');
    expect(url).toContain('Action=GetCallerIdentity');
    expect(url).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
    expect(url).toContain('X-Amz-Signature=');
    // The cluster header must be a SIGNED header, and must NOT leak into the query.
    expect(decodeURIComponent(url)).toContain('X-Amz-SignedHeaders=host;x-k8s-aws-id');
    expect(url).not.toContain('x-k8s-aws-id=prod-eks');
  });

  it('binds the token to the cluster name (different cluster → different signature)', async () => {
    const a = await eksBearerToken(creds, 'prod-eks');
    const b = await eksBearerToken(creds, 'stage-eks');
    expect(a.token).not.toEqual(b.token);
  });
});
