import { describe, it, expect } from 'vitest';
import { rollup } from './rollup';
import type { Finding, Severity, FindingStatus } from '@shared/types';

const f = (severity: Severity, status: FindingStatus = 'open'): Finding =>
  ({ id: Math.random().toString(), caseId: 'c', title: 't', severity, status, createdAt: 0, updatedAt: 0 });

describe('rollup', () => {
  it('picks the highest severity among active findings', () => {
    const r = rollup([f('low'), f('critical'), f('medium')]);
    expect(r.top).toBe('critical');
    expect(r.open).toBe(3);
    expect(r.total).toBe(3);
  });

  it('excludes resolved / wontfix from top and open', () => {
    const r = rollup([f('critical', 'resolved'), f('high', 'wontfix'), f('medium', 'investigating')]);
    expect(r.top).toBe('medium'); // critical & high are closed out
    expect(r.open).toBe(1);
    expect(r.total).toBe(3);
    expect(r.counts.critical).toBe(1); // counts still tally every finding
  });

  it('returns no top severity when nothing is active', () => {
    const r = rollup([f('high', 'resolved')]);
    expect(r.top).toBeUndefined();
    expect(r.open).toBe(0);
  });

  it('handles an empty case', () => {
    expect(rollup([])).toEqual({ top: undefined, open: 0, total: 0, counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 } });
  });
});
