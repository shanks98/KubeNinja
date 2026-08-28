import { describe, it, expect } from 'vitest';
import { certFindings } from './cert';
import type { CertResult } from '@shared/types';

const base = (o: Partial<CertResult>): CertResult => ({
  subject: 'CN=shop.example.com', subjectCN: 'shop.example.com',
  issuer: "CN=R3, O=Let's Encrypt", issuerCN: 'R3',
  validFrom: new Date(Date.now() - 30 * 864e5).toISOString(),
  validTo: new Date(Date.now() + 60 * 864e5).toISOString(),
  daysLeft: 60, expired: false, sigAlg: 'SHA256-RSA', keyType: 'RSA', bits: 2048,
  sans: ['shop.example.com', 'www.shop.example.com'], selfSigned: false, authorized: true,
  ...o,
});

describe('certFindings', () => {
  it('is clean for a healthy cert', () => {
    expect(certFindings(base({}))).toHaveLength(0);
  });

  it('flags weak signature, short key, self-signed and hostname mismatch', () => {
    const f = certFindings(base({ host: 'legacy.example.com', sigAlg: 'SHA1-RSA', bits: 1024, selfSigned: true, authorized: false, sans: ['old.internal.local', '*.internal.local'] }));
    const titles = f.map((x) => x.title);
    expect(titles).toEqual(expect.arrayContaining([expect.stringMatching(/Weak signature/), expect.stringMatching(/Short RSA/), expect.stringMatching(/Self-signed/), 'Hostname mismatch', 'Wildcard certificate']));
    expect(f[0].sev).toBe('High'); // sorted, highest first
  });

  it('flags expiry windows', () => {
    expect(certFindings(base({ daysLeft: -2, validTo: new Date(Date.now() - 2 * 864e5).toISOString() })).some((x) => x.title === 'Certificate expired')).toBe(true);
    expect(certFindings(base({ daysLeft: 9 })).some((x) => x.title === 'Expiring soon')).toBe(true);
  });

  it('matches wildcard SANs correctly', () => {
    expect(certFindings(base({ host: 'api.internal.local', sans: ['*.internal.local'] })).some((x) => x.title === 'Hostname mismatch')).toBe(false);
  });
});
