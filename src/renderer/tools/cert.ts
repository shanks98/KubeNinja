import type { CertResult } from '@shared/types';

export type Sev = 'High' | 'Medium' | 'Low' | 'Info';
export interface CertFinding { sev: Sev; title: string; detail: string; rec: string }

const RANK: Record<Sev, number> = { High: 0, Medium: 1, Low: 2, Info: 3 };

function sanMatch(host: string, sans: string[] | undefined, cn?: string): boolean {
  const names = sans && sans.length ? sans : (cn ? [cn] : []);
  return names.some((s) => {
    if (s.startsWith('*.')) return host.split('.').slice(1).join('.') === s.slice(2);
    return s.toLowerCase() === host.toLowerCase();
  });
}

/** Security findings for an inspected certificate, most-severe first. */
export function certFindings(c: CertResult): CertFinding[] {
  const F: CertFinding[] = [];
  const add = (sev: Sev, title: string, detail: string, rec: string) => F.push({ sev, title, detail, rec });
  const days = c.daysLeft;
  const validityDays = Math.round((new Date(c.validTo).getTime() - new Date(c.validFrom).getTime()) / 86_400_000);

  if (days < 0) add('High', 'Certificate expired', `Expired ${Math.abs(days)} days ago.`, 'Renew immediately; clients will reject the connection.');
  else if (days < 15) add('Medium', 'Expiring soon', `Only ${days} days until expiry.`, 'Renew now to avoid an outage.');
  else if (days < 30) add('Low', 'Expiring within 30 days', `Expires in ${days} days.`, 'Schedule renewal / confirm auto-renew is working.');

  if (c.sigAlg && /sha1|md5/i.test(c.sigAlg)) add('High', `Weak signature algorithm (${c.sigAlg})`, 'SHA-1/MD5 signatures are collision-prone and distrusted by modern clients.', 'Reissue with SHA-256 or better.');
  if (c.keyType === 'RSA' && c.bits !== undefined && c.bits < 2048) add('Medium', `Short RSA key (${c.bits}-bit)`, 'Keys under 2048-bit are considered weak.', 'Reissue with a ≥2048-bit RSA or an EC key.');
  if (c.selfSigned || c.authorized === false) add('Medium', 'Self-signed / untrusted chain', 'The certificate does not chain to a trusted root.', 'Use a CA-issued certificate, or add the root to the trust store deliberately.');
  if (c.host && !sanMatch(c.host, c.sans, c.subjectCN)) add('High', 'Hostname mismatch', `The connected host "${c.host}" is not covered by the certificate SANs (${(c.sans ?? []).join(', ') || 'none'}).`, 'Reissue with the correct SANs, or connect to a covered name.');
  if (validityDays > 398) add('Low', 'Validity exceeds 398 days', 'Public CAs cap TLS certs at 398 days; long-lived certs are riskier.', 'Shorten validity; automate renewal.');
  const wildcard = (c.sans ?? []).find((s) => s.startsWith('*.'));
  if (wildcard) add('Info', 'Wildcard certificate', `A wildcard (${wildcard}) covers all first-level subdomains — one key, broad blast radius.`, 'Scope wildcards tightly; protect the key.');

  F.sort((a, b) => RANK[a.sev] - RANK[b.sev]);
  return F;
}
