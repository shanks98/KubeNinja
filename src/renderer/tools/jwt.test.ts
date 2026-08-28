import { describe, it, expect } from 'vitest';
import { analyzeJwt } from './jwt';
import { base64Encode } from './pureTools';

const b64u = (o: unknown) => base64Encode(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const tok = (h: unknown, p: unknown, sig = 'sig') => `${b64u(h)}.${b64u(p)}.${sig}`;

describe('analyzeJwt', () => {
  it('flags alg:none as High', () => {
    const r = analyzeJwt(tok({ alg: 'none' }, { sub: 'x', exp: 9999999999, iss: 'a', aud: 'b' }));
    expect(r.findings[0].sev).toBe('High');
    expect(r.findings[0].title).toMatch(/Unsigned/);
  });

  it('flags an expired token and missing claims', () => {
    const r = analyzeJwt(tok({ alg: 'RS256' }, { sub: 'x', exp: 1 }));
    expect(r.findings.some((f) => f.title === 'Token expired' && f.sev === 'High')).toBe(true);
    expect(r.findings.some((f) => /issuer/.test(f.title))).toBe(true);
    expect(r.findings.some((f) => /audience/.test(f.title))).toBe(true);
  });

  it('flags a long-lived HS token', () => {
    const now = Math.floor(Date.now() / 1000);
    const r = analyzeJwt(tok({ alg: 'HS256' }, { iss: 'a', aud: 'b', iat: now, exp: now + 90 * 86400 }));
    expect(r.findings.some((f) => /Symmetric HMAC/.test(f.title) && f.sev === 'Medium')).toBe(true);
    expect(r.findings.some((f) => /Long-lived/.test(f.title))).toBe(true);
  });

  it('is clean for a short-lived asymmetric token with all claims', () => {
    const now = Math.floor(Date.now() / 1000);
    const r = analyzeJwt(tok({ alg: 'ES256' }, { iss: 'a', aud: 'b', iat: now, exp: now + 300 }));
    expect(r.findings).toHaveLength(0);
    expect(r.alg).toBe('ES256');
  });
});
