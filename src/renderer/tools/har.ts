// Forensic HAR analysis (DockerLens-style), pure and renderer-side. Parses an
// HTTP Archive, scores each request for risk, aggregates security findings, and
// reconstructs the authentication flow.

export type Severity = 'High' | 'Medium' | 'Low' | 'Informational';
export interface HarIssue { severity: 'High' | 'Medium' | 'Low'; msg: string }
export interface HarEntry {
  method: string; url: string; status: number; mime: string; size: number; timeMs: number;
  risk: 'high' | 'medium' | 'low' | 'none'; issues: HarIssue[];
  payloadPreview: string; responsePreview: string;
}
export interface HarFinding { id: string; severity: Severity; category: string; title: string; description: string; evidence: string; recommendation: string }
export interface AuthStep { sequence: number; url: string; method: string; action: string; status: number; details: string }
export interface AuthAnomaly { severity: string; type: string; description: string }
export interface HarSummary {
  filename: string;
  totalRequests: number; successRequests: number; redirectRequests: number; failedRequests: number;
  avgTimeMs: number; slowestTimeMs: number; slowestUrl: string;
  statusDistribution: Record<string, number>;
  topSlow: { url: string; method: string; timeMs: number; status: number }[];
  endpointUsage: { endpoint: string; count: number; avgTimeMs: number }[];
  entries: HarEntry[];
  security: { findings: HarFinding[]; summary: Record<Severity, number> };
  auth: { steps: AuthStep[]; anomalies: AuthAnomaly[] };
}

interface Header { name: string; value: string }
const SECRET_KEYS = /(access_token|id_token|refresh_token|token|apikey|api_key|secret|password|passwd|sig|signature|sessionid|auth)/i;
const hget = (headers: Header[] | undefined, name: string) => (headers ?? []).find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
const pathOf = (u: string) => { try { return new URL(u).pathname; } catch { return u; } };
const SEV_RANK: Record<'High' | 'Medium' | 'Low', number> = { High: 0, Medium: 1, Low: 2 };

export function analyzeHar(text: string, filename = 'capture.har'): HarSummary {
  let har: { log?: { entries?: unknown[] } };
  try { har = JSON.parse(text); } catch { throw new Error('Not valid JSON'); }
  const rawEntries = har?.log?.entries;
  if (!Array.isArray(rawEntries) || rawEntries.length === 0) throw new Error('No log.entries[] — not a HAR file');

  const pageSecure = /^https:/.test((rawEntries[0] as { request?: { url?: string } })?.request?.url ?? '');
  const findings: HarFinding[] = [];
  const addF = (severity: Severity, category: string, title: string, description: string, evidence: string, recommendation: string) =>
    findings.push({ id: 'f' + findings.length, severity, category, title, description, evidence, recommendation });

  const meta: { authz: string; setCookie: string; hasTokenParam: boolean }[] = [];
  const entries: HarEntry[] = rawEntries.map((raw) => {
    const e = raw as { request?: { method?: string; url?: string; headers?: Header[]; postData?: { text?: string } }; response?: { status?: number; content?: { mimeType?: string; size?: number; text?: string }; bodySize?: number; headers?: Header[] }; time?: number };
    const req = e.request ?? {};
    const res = e.response ?? {};
    const url = req.url ?? '';
    const status = res.status ?? 0;
    const mime = (res.content?.mimeType ?? '').split(';')[0] || '—';
    const size = res.content?.size ?? res.bodySize ?? 0;
    const timeMs = Math.round(e.time ?? 0);
    const issues: HarIssue[] = [];

    let params: URLSearchParams | null = null;
    try { params = new URL(url).searchParams; } catch { params = null; }
    let hasTokenParam = false;
    if (params) for (const [k, v] of params) {
      if (SECRET_KEYS.test(k) && v && v.length > 6) issues.push({ severity: 'High', msg: `Secret-like query param "${k}" exposed in URL` });
      if (/access_token|token/i.test(k)) hasTokenParam = true;
    }
    const authz = hget(req.headers, 'authorization');
    if (/^basic /i.test(authz)) issues.push({ severity: 'Medium', msg: 'HTTP Basic credentials sent (base64, reversible)' });
    if (/^bearer /i.test(authz) && !pageSecure) issues.push({ severity: 'High', msg: 'Bearer token sent over cleartext HTTP' });
    const setCookie = hget(res.headers, 'set-cookie');
    if (setCookie) {
      if (!/;\s*secure/i.test(setCookie)) issues.push({ severity: 'Medium', msg: 'Set-Cookie missing Secure flag' });
      if (!/;\s*httponly/i.test(setCookie)) issues.push({ severity: 'Medium', msg: 'Set-Cookie missing HttpOnly flag' });
    }
    if (pageSecure && /^http:\/\//.test(url)) issues.push({ severity: 'Medium', msg: 'Mixed content: HTTP resource on an HTTPS page' });
    if (/text\/html/.test(mime)) {
      if (!hget(res.headers, 'content-security-policy')) issues.push({ severity: 'Low', msg: 'Missing Content-Security-Policy header' });
      if (pageSecure && !hget(res.headers, 'strict-transport-security')) issues.push({ severity: 'Low', msg: 'Missing Strict-Transport-Security (HSTS)' });
      if (!hget(res.headers, 'x-content-type-options')) issues.push({ severity: 'Low', msg: 'Missing X-Content-Type-Options: nosniff' });
    }
    if (status >= 500) issues.push({ severity: 'Medium', msg: `Server error ${status}` });
    else if (status >= 400) issues.push({ severity: 'Low', msg: `Client error ${status}` });
    if (timeMs >= 1000) issues.push({ severity: 'Low', msg: `Slow response (${timeMs}ms)` });

    const worst = issues.reduce((r, i) => Math.min(r, SEV_RANK[i.severity]), 3);
    const risk = (['high', 'medium', 'low', 'none'] as const)[worst];
    meta.push({ authz, setCookie, hasTokenParam });
    return { method: req.method ?? '', url, status, mime, size, timeMs, risk, issues, payloadPreview: (req.postData?.text ?? '').slice(0, 600), responsePreview: (res.content?.text ?? '').slice(0, 600) };
  });

  // aggregate security findings
  const withMsg = (re: RegExp) => entries.filter((r) => r.issues.some((i) => re.test(i.msg)));
  const secretRows = withMsg(/Secret-like/);
  if (secretRows.length) addF('High', 'Secrets Exposure', 'Credentials in URL query strings', `${secretRows.length} request(s) carry token/secret-like parameters in the URL, which get logged by proxies, servers and browser history.`, secretRows[0].url, 'Move secrets to the Authorization header or a POST body; rotate any exposed tokens.');
  const basic = entries.filter((_, i) => /^basic /i.test(meta[i].authz));
  if (basic.length) addF('Medium', 'Authentication', 'HTTP Basic authentication in use', `${basic.length} request(s) use Basic auth. Credentials are base64-encoded (trivially reversible), not encrypted.`, basic[0].url, 'Use token-based auth (OAuth2/OIDC bearer) over TLS.');
  const insecureCookie = entries.filter((_, i) => meta[i].setCookie && (!/secure/i.test(meta[i].setCookie) || !/httponly/i.test(meta[i].setCookie)));
  if (insecureCookie.length) addF('Medium', 'Session', 'Cookies without Secure/HttpOnly', `${insecureCookie.length} Set-Cookie response(s) omit Secure and/or HttpOnly, exposing session cookies to theft.`, meta[entries.indexOf(insecureCookie[0])].setCookie, 'Set Secure, HttpOnly and SameSite on all session cookies.');
  const mixed = withMsg(/Mixed content/);
  if (mixed.length) addF('Medium', 'Transport', 'Mixed content loaded', `${mixed.length} HTTP resource(s) loaded on an HTTPS page — susceptible to tampering.`, mixed[0].url, 'Serve every subresource over HTTPS.');
  const noHsts = withMsg(/HSTS/);
  if (noHsts.length) addF('Low', 'Headers', 'Missing HSTS / CSP', 'HTML responses are missing hardening headers (HSTS, CSP, X-Content-Type-Options).', noHsts[0].url, 'Add Strict-Transport-Security, Content-Security-Policy and X-Content-Type-Options.');
  const summary: Record<Severity, number> = { High: 0, Medium: 0, Low: 0, Informational: 0 };
  findings.forEach((f) => summary[f.severity]++);

  // auth flow
  const steps: AuthStep[] = [];
  const anomalies: AuthAnomaly[] = [];
  let seq = 0;
  entries.forEach((r, i) => {
    const p = pathOf(r.url).toLowerCase();
    let action = '';
    if (/\/(oauth\/token|token|auth\/token)/.test(p)) action = 'Token issued';
    else if (/\/(login|signin|session)$/.test(p) && r.method === 'POST') action = 'Login';
    else if (/\/(refresh)/.test(p)) action = 'Token refresh';
    else if (/\/(logout|signout)/.test(p)) action = 'Logout';
    else if (/^bearer /i.test(meta[i].authz)) action = 'Authenticated call';
    if (action) steps.push({ sequence: ++seq, url: r.url, method: r.method, action, status: r.status, details: action === 'Token issued' ? 'access_token in response' : (/^bearer /i.test(meta[i].authz) ? 'Authorization: Bearer …' : '') });
    if (meta[i].hasTokenParam) anomalies.push({ severity: 'High', type: 'Token in URL', description: `${r.method} ${pathOf(r.url)} carries a token in the query string` });
  });
  if (steps.length && !steps.some((s) => s.action === 'Logout')) anomalies.push({ severity: 'Low', type: 'No logout', description: 'No logout/session-teardown request was captured' });

  // rollups
  const statusDistribution: Record<string, number> = {};
  entries.forEach((r) => { const key = r.status || '(failed)'; statusDistribution[key] = (statusDistribution[key] || 0) + 1; });
  const success = entries.filter((r) => r.status >= 200 && r.status < 300).length;
  const redirect = entries.filter((r) => r.status >= 300 && r.status < 400).length;
  const failed = entries.filter((r) => r.status === 0 || r.status >= 400).length;
  const times = entries.map((r) => r.timeMs);
  const avg = Math.round(times.reduce((a, b) => a + b, 0) / (times.length || 1));
  const slow = [...entries].sort((a, b) => b.timeMs - a.timeMs);
  const usage: Record<string, { endpoint: string; count: number; t: number }> = {};
  entries.forEach((r) => { const key = `${r.method} ${pathOf(r.url)}`; (usage[key] ??= { endpoint: key, count: 0, t: 0 }).count++; usage[key].t += r.timeMs; });
  const endpointUsage = Object.values(usage).map((u) => ({ endpoint: u.endpoint, count: u.count, avgTimeMs: Math.round(u.t / u.count) })).sort((a, b) => b.count - a.count).slice(0, 12);

  return {
    filename, totalRequests: entries.length, successRequests: success, redirectRequests: redirect, failedRequests: failed,
    avgTimeMs: avg, slowestTimeMs: slow[0]?.timeMs ?? 0, slowestUrl: slow[0]?.url ?? '',
    statusDistribution, topSlow: slow.slice(0, 8).map((r) => ({ url: r.url, method: r.method, timeMs: r.timeMs, status: r.status })),
    endpointUsage, entries, security: { findings, summary }, auth: { steps, anomalies },
  };
}
