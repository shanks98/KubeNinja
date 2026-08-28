import { describe, it, expect } from 'vitest';
import { analyzeHar } from './har';

const har = (entries: unknown[]) => JSON.stringify({ log: { entries } });
const H = (o: Record<string, string>) => Object.entries(o).map(([name, value]) => ({ name, value }));

describe('analyzeHar', () => {
  it('rejects non-HAR input', () => {
    expect(() => analyzeHar('nope')).toThrow(/valid JSON/);
    expect(() => analyzeHar(har([]))).toThrow(/log.entries/);
  });

  it('counts statuses and computes latency rollups', () => {
    const s = analyzeHar(har([
      { request: { method: 'GET', url: 'https://a/x' }, response: { status: 200, content: { size: 10 } }, time: 50 },
      { request: { method: 'GET', url: 'https://a/y' }, response: { status: 301 }, time: 20 },
      { request: { method: 'POST', url: 'https://a/z' }, response: { status: 502 }, time: 1200 },
    ]));
    expect(s.totalRequests).toBe(3);
    expect(s.successRequests).toBe(1);
    expect(s.redirectRequests).toBe(1);
    expect(s.failedRequests).toBe(1);
    expect(s.slowestTimeMs).toBe(1200);
  });

  it('flags a secret in the URL as a High finding and an auth anomaly', () => {
    const s = analyzeHar(har([
      { request: { method: 'GET', url: 'https://a/profile?access_token=eyJabc123456' }, response: { status: 200 }, time: 30 },
    ]));
    const f = s.security.findings.find((x) => x.category === 'Secrets Exposure');
    expect(f?.severity).toBe('High');
    expect(s.entries[0].risk).toBe('high');
    expect(s.auth.anomalies.some((a) => a.type === 'Token in URL')).toBe(true);
  });

  it('flags Basic auth and insecure cookies', () => {
    const s = analyzeHar(har([
      { request: { method: 'GET', url: 'https://a/admin', headers: H({ authorization: 'Basic YWRtaW46cGFzcw==' }) }, response: { status: 200, headers: H({ 'set-cookie': 'sid=1; Path=/' }) }, time: 40 },
    ]));
    expect(s.security.findings.some((f) => f.category === 'Authentication')).toBe(true);
    expect(s.security.findings.some((f) => f.category === 'Session')).toBe(true);
    expect(s.security.summary.Medium).toBeGreaterThanOrEqual(2);
  });

  it('reconstructs an auth flow with a token issue then authenticated calls', () => {
    const s = analyzeHar(har([
      { request: { method: 'POST', url: 'https://a/oauth/token' }, response: { status: 200 }, time: 100 },
      { request: { method: 'GET', url: 'https://a/api/me', headers: H({ authorization: 'Bearer abc' }) }, response: { status: 200 }, time: 30 },
    ]));
    expect(s.auth.steps.map((x) => x.action)).toEqual(['Token issued', 'Authenticated call']);
    expect(s.auth.anomalies.some((a) => a.type === 'No logout')).toBe(true);
  });
});
