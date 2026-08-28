import type { Finding, Severity, SeverityRollup } from '@shared/types';

export const SEV_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

/** Roll a case's findings up to a top-severity + open/total counts. Resolved and
 *  won't-fix findings don't count toward the "top" severity or the open count. */
export function rollup(findings: Finding[]): SeverityRollup {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 } as Record<Severity, number>;
  let top: Severity | undefined;
  let open = 0;
  for (const f of findings) {
    counts[f.severity]++;
    const active = f.status !== 'resolved' && f.status !== 'wontfix';
    if (active) {
      open++;
      if (!top || SEV_RANK[f.severity] < SEV_RANK[top]) top = f.severity;
    }
  }
  return { top, open, total: findings.length, counts };
}
