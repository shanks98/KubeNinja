import { promises as dns } from 'node:dns';
import tls from 'node:tls';
import { X509Certificate, type KeyObject } from 'node:crypto';
import type { DnsRecordType, DnsResult, CertResult, CertChainNode } from '@shared/types';

/** Resolve DNS records of a given type via the OS resolver. */
export async function dnsLookup(host: string, type: DnsRecordType): Promise<DnsResult> {
  const h = host.trim();
  const started = Date.now();
  let records: string[] = [];
  switch (type) {
    case 'A': records = await dns.resolve4(h); break;
    case 'AAAA': records = await dns.resolve6(h); break;
    case 'CNAME': records = await dns.resolveCname(h); break;
    case 'NS': records = await dns.resolveNs(h); break;
    case 'TXT': records = (await dns.resolveTxt(h)).map((chunks) => chunks.join('')); break;
    case 'MX': records = (await dns.resolveMx(h)).sort((a, b) => a.priority - b.priority).map((r) => `${r.priority} ${r.exchange}`); break;
  }
  return { host: h, type, records, ms: Date.now() - started };
}

// ── Certificate inspection ────────────────────────────────────────────
// Map common signature-algorithm OIDs (from the DER) to friendly names so we
// can flag weak (SHA-1/MD5) signatures.
const SIG_OIDS: Record<string, string> = {
  '1.2.840.113549.1.1.4': 'MD5-RSA',
  '1.2.840.113549.1.1.5': 'SHA1-RSA',
  '1.2.840.113549.1.1.11': 'SHA256-RSA',
  '1.2.840.113549.1.1.12': 'SHA384-RSA',
  '1.2.840.113549.1.1.13': 'SHA512-RSA',
  '1.2.840.113549.1.1.10': 'RSA-PSS',
  '1.2.840.10045.4.1': 'ECDSA-SHA1',
  '1.2.840.10045.4.3.2': 'ECDSA-SHA256',
  '1.2.840.10045.4.3.3': 'ECDSA-SHA384',
  '1.2.840.10045.4.3.4': 'ECDSA-SHA512',
  '1.3.101.112': 'Ed25519',
};

function readLen(b: Buffer, pos: number): { len: number; next: number } {
  const first = b[pos];
  if (first < 0x80) return { len: first, next: pos + 1 };
  const n = first & 0x7f;
  let len = 0;
  for (let i = 0; i < n; i++) len = (len << 8) | b[pos + 1 + i];
  return { len, next: pos + 1 + n };
}
function decodeOid(b: Buffer): string {
  const out = [Math.floor(b[0] / 40), b[0] % 40];
  let v = 0;
  for (let i = 1; i < b.length; i++) { v = (v << 7) | (b[i] & 0x7f); if (!(b[i] & 0x80)) { out.push(v); v = 0; } }
  return out.join('.');
}
/** Pull the outer signatureAlgorithm OID out of a certificate's DER bytes. */
function sigAlgFromDer(der: Buffer): string | undefined {
  try {
    // top: SEQUENCE { tbsCertificate SEQUENCE, signatureAlgorithm SEQUENCE {OID}, sig }
    let p = readLen(der, 1).next;              // into the top SEQUENCE content
    const tbs = readLen(der, p + 1);           // tbsCertificate SEQUENCE
    p = tbs.next + tbs.len;                     // skip tbsCertificate → signatureAlgorithm
    const sa = readLen(der, p + 1);            // signatureAlgorithm SEQUENCE
    let q = sa.next;                           // first field: OID (tag 0x06)
    if (der[q] !== 0x06) return undefined;
    const oid = readLen(der, q + 1);
    return SIG_OIDS[decodeOid(der.subarray(oid.next, oid.next + oid.len))];
  } catch { return undefined; }
}

function rdnCN(dn: string): string | undefined { return /(?:^|,|\n)\s*CN=([^,\n]+)/.exec(dn)?.[1]?.trim(); }
function rdnO(dn: string): string | undefined { return /(?:^|,|\n)\s*O=([^,\n]+)/.exec(dn)?.[1]?.trim(); }
function sansOf(alt: string | undefined): string[] | undefined {
  return alt ? alt.split(',').map((s) => s.trim().replace(/^DNS:/, '')) : undefined;
}
function keyInfo(pk: KeyObject | null): { keyType?: string; bits?: number } {
  if (!pk) return {};
  const type = pk.asymmetricKeyType;
  const details = pk.asymmetricKeyDetails as { modulusLength?: number } | undefined;
  return { keyType: type ? type.toUpperCase() : undefined, bits: details?.modulusLength };
}
function fromX509(x: X509Certificate, extra: Partial<CertResult>): CertResult {
  const validTo = new Date(x.validTo);
  const daysLeft = Math.round((validTo.getTime() - Date.now()) / 86_400_000);
  const key = keyInfo(x.publicKey);
  return {
    subject: x.subject, subjectCN: rdnCN(x.subject), subjectO: rdnO(x.subject),
    issuer: x.issuer, issuerCN: rdnCN(x.issuer),
    serialNumber: x.serialNumber,
    validFrom: new Date(x.validFrom).toISOString(), validTo: validTo.toISOString(), daysLeft, expired: daysLeft < 0,
    sigAlg: sigAlgFromDer(x.raw), keyType: key.keyType, bits: key.bits,
    sans: sansOf(x.subjectAltName), isCA: x.ca, selfSigned: x.subject === x.issuer,
    authorized: true,
    ...extra,
  };
}

/** Inspect a PEM-encoded certificate directly (no network). */
export function certFromPem(pem: string): CertResult {
  if (!/-----BEGIN CERTIFICATE-----/.test(pem)) throw new Error('expected a PEM certificate (-----BEGIN CERTIFICATE-----)');
  return fromX509(new X509Certificate(pem), {});
}

/** Open a TLS connection and inspect the presented certificate chain. */
export function certCheck(hostPort: string): Promise<CertResult> {
  const [host, portStr] = hostPort.trim().split(':');
  const port = Number(portStr) || 443;
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: false, timeout: 6000 }, () => {
      const peer = socket.getPeerCertificate(true);
      const authorized = socket.authorized;
      socket.end();
      if (!peer || !peer.raw) { reject(new Error('no certificate presented')); return; }

      // Walk the chain via issuerCertificate.
      const chain: CertChainNode[] = [];
      let node: typeof peer | undefined = peer;
      const seen = new Set<string>();
      while (node && !seen.has(node.fingerprint256 ?? node.fingerprint)) {
        seen.add(node.fingerprint256 ?? node.fingerprint);
        const to = new Date(node.valid_to);
        chain.push({ subject: (node.subject as { CN?: string })?.CN ?? node.subject?.toString?.() ?? '', issuer: (node.issuer as { CN?: string })?.CN ?? '', daysLeft: Math.round((to.getTime() - Date.now()) / 86_400_000) });
        node = node.issuerCertificate && node.issuerCertificate !== node ? node.issuerCertificate : undefined;
      }

      const base = fromX509(new X509Certificate(peer.raw), { host, port, authorized: authorized ?? false, chain });
      resolve(base);
    });
    socket.on('error', (e) => { const m = String(e); reject(new Error(/timeout/i.test(m) ? 'connection timed out' : m)); });
    socket.on('timeout', () => { socket.destroy(); reject(new Error('connection timed out')); });
  });
}
