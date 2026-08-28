import { base64Decode } from './pureTools';

export type Sev = 'High' | 'Medium' | 'Low' | 'Info';
export interface JwtFinding { sev: Sev; title: string; detail: string; rec: string }
export interface JwtAnalysis {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
  alg: string;
  findings: JwtFinding[];
}

const RANK: Record<Sev, number> = { High: 0, Medium: 1, Low: 2, Info: 3 };

/** Human relative time for an epoch-seconds timestamp (e.g. "in 59m", "3d ago"). */
export function relTime(sec: number): string {
  const diff = (Date.now() - sec * 1000) / 1000;
  const a = Math.abs(diff);
  const u = a < 60 ? `${Math.round(a)}s` : a < 3600 ? `${Math.round(a / 60)}m` : a < 86400 ? `${Math.round(a / 3600)}h` : `${Math.round(a / 86400)}d`;
  return diff >= 0 ? `${u} ago` : `in ${u}`;
}

/** Decode a JWT and run a security analysis over its header + claims. */
export function analyzeJwt(token: string): JwtAnalysis {
  const parts = token.trim().split('.');
  if (parts.length < 2) throw new Error('Not a JWT — expected header.payload.signature');
  const header = JSON.parse(base64Decode(parts[0])) as Record<string, unknown>;
  const payload = JSON.parse(base64Decode(parts[1])) as Record<string, unknown>;

  const findings: JwtFinding[] = [];
  const add = (sev: Sev, title: string, detail: string, rec: string) => findings.push({ sev, title, detail, rec });
  const alg = String(header.alg ?? '');
  const now = Date.now() / 1000;
  const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
  const exp = num(payload.exp); const iat = num(payload.iat); const nbf = num(payload.nbf);

  if (/^none$/i.test(alg)) add('High', 'Unsigned token (alg: none)', 'The token declares no signature algorithm — anyone can forge or tamper with it.', 'Reject alg:none server-side; require an allow-list of asymmetric algorithms.');
  else if (/^HS/i.test(alg)) add('Medium', `Symmetric HMAC signature (${alg})`, 'Signed with a shared secret; if the secret is weak or leaked, tokens can be forged (same key signs and verifies).', 'Prefer asymmetric (RS/ES/PS); ensure the HMAC secret is long and rotated.');

  if (exp !== undefined) { if (exp < now) add('High', 'Token expired', `The exp claim is in the past (${relTime(exp)}).`, 'Re-authenticate; expired tokens must be rejected.'); }
  else add('Medium', 'No expiry (exp) claim', 'The token never expires — a leaked token is valid forever.', 'Always set a short exp; use refresh tokens for longevity.');
  if (nbf !== undefined && nbf > now) add('Medium', 'Not yet valid (nbf in the future)', `The nbf claim is in the future (${relTime(nbf)}).`, 'Check clock skew between issuer and verifier.');
  if (exp !== undefined && iat !== undefined && exp - iat > 86400) add('Low', 'Long-lived token', `Lifetime is ${Math.round((exp - iat) / 3600)}h — long-lived bearer tokens widen the blast radius if leaked.`, 'Shorten the lifetime; rotate frequently.');
  if (!payload.iss) add('Low', 'No issuer (iss) claim', 'Without iss, the verifier cannot pin the trusted token authority.', 'Set and validate iss.');
  if (!payload.aud) add('Low', 'No audience (aud) claim', 'Without aud, a token minted for one service can be replayed against another.', 'Set and validate aud per service.');

  findings.sort((a, b) => RANK[a.sev] - RANK[b.sev]);
  return { header, payload, signature: parts[2] ?? '', alg, findings };
}
