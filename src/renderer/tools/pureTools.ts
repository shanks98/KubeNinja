// Pure, dependency-free investigation utilities that run entirely in the renderer.
// DNS and certificate checks live in the main process (see src/main/tools.ts).

export function base64Encode(s: string): string { return btoa(unescape(encodeURIComponent(s))); }
export function base64Decode(s: string): string {
  return decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, ''))));
}
export function urlEncode(s: string): string { return encodeURIComponent(s); }
export function urlDecode(s: string): string { return decodeURIComponent(s); }

export interface JwtResult { header: unknown; payload: Record<string, unknown>; expired?: boolean }
export function jwtDecode(token: string): JwtResult {
  const p = token.trim().split('.');
  if (p.length < 2) throw new Error('Not a JWT — expected header.payload.signature');
  const header = JSON.parse(base64Decode(p[0]));
  const payload = JSON.parse(base64Decode(p[1])) as Record<string, unknown>;
  const exp = payload.exp;
  const expired = typeof exp === 'number' ? exp * 1000 < Date.now() : undefined;
  return { header, payload, expired };
}

export async function hashText(s: string): Promise<{ sha256: string; sha1: string }> {
  const data = new TextEncoder().encode(s);
  const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', data), crypto.subtle.digest('SHA-1', data)]);
  return { sha256: hex(a), sha1: hex(b) };
}

export interface TsResult { iso: string; local: string; epochS: number; epochMs: number; relative: string }
export function tsConvert(input: string): TsResult {
  const v = input.trim();
  if (!v) throw new Error('empty');
  const d = /^\d+$/.test(v) ? new Date(Number(v) > 1e12 ? Number(v) : Number(v) * 1000) : new Date(v);
  if (isNaN(d.getTime())) throw new Error('unrecognized timestamp');
  const rel = (Date.now() - d.getTime()) / 1000;
  const a = Math.abs(rel);
  const ago = a < 60 ? `${Math.round(a)}s` : a < 3600 ? `${Math.round(a / 60)}m` : a < 86400 ? `${Math.round(a / 3600)}h` : `${Math.round(a / 86400)}d`;
  return { iso: d.toISOString(), local: d.toLocaleString(), epochS: Math.floor(d.getTime() / 1000), epochMs: d.getTime(), relative: rel >= 0 ? `${ago} ago` : `in ${ago}` };
}

export function jsonFormat(text: string): string { return JSON.stringify(JSON.parse(text), null, 2); }

export interface CidrResult { cidr: string; network: string; broadcast: string; firstHost: string; lastHost: string; mask: string; hosts: number }
export function cidrInfo(cidr: string): CidrResult {
  const [ip, bitsStr] = cidr.trim().split('/');
  const bits = Number(bitsStr);
  const parts = (ip ?? '').split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255) || isNaN(bits) || bits < 0 || bits > 32) throw new Error('invalid IPv4 CIDR (e.g. 10.0.0.0/24)');
  const ipn = ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  const net = (ipn & mask) >>> 0;
  const bcast = (net | (~mask >>> 0)) >>> 0;
  const toIp = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  const hosts = bits >= 31 ? (bits === 32 ? 1 : 2) : bcast - net - 1;
  return { cidr: cidr.trim(), network: toIp(net), broadcast: toIp(bcast), firstHost: toIp(bits >= 31 ? net : net + 1), lastHost: toIp(bits >= 31 ? bcast : bcast - 1), mask: toIp(mask), hosts: Math.max(hosts, 0) };
}
