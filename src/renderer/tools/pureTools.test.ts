import { describe, it, expect } from 'vitest';
import { base64Encode, base64Decode, jwtDecode, tsConvert, cidrInfo, jsonFormat } from './pureTools';

describe('pure tools', () => {
  it('base64 round-trips UTF-8', () => {
    const s = 'shinobi · 忍者';
    expect(base64Decode(base64Encode(s))).toBe(s);
    expect(base64Encode('shinobi')).toBe('c2hpbm9iaQ==');
  });

  it('base64 accepts url-safe input', () => {
    expect(base64Decode('c2hpbm9iaQ')).toBe('shinobi');
  });

  it('decodes a JWT and flags expiry', () => {
    const b64u = (o: unknown) => base64Encode(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const tok = `${b64u({ alg: 'HS256' })}.${b64u({ sub: 'checkout', exp: 1 })}.sig`;
    const r = jwtDecode(tok);
    expect((r.header as { alg: string }).alg).toBe('HS256');
    expect(r.payload.sub).toBe('checkout');
    expect(r.expired).toBe(true); // exp=1 (1970) is long past
  });

  it('computes CIDR ranges', () => {
    const r = cidrInfo('10.0.0.0/24');
    expect(r).toMatchObject({ network: '10.0.0.0', broadcast: '10.0.0.255', firstHost: '10.0.0.1', lastHost: '10.0.0.254', mask: '255.255.255.0', hosts: 254 });
    expect(cidrInfo('192.168.1.128/25').network).toBe('192.168.1.128');
  });

  it('converts an epoch timestamp', () => {
    const r = tsConvert('0');
    expect(r.iso).toBe('1970-01-01T00:00:00.000Z');
    expect(r.epochS).toBe(0);
  });

  it('formats JSON and throws on garbage', () => {
    expect(jsonFormat('{"a":1}')).toContain('"a": 1');
    expect(() => jsonFormat('not json')).toThrow();
  });
});
