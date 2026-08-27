import { describe, it, expect } from 'vitest';
import { KubeObject } from './KubeObject';

describe('KubeObject', () => {
  it('prefers uid for id, falls back to kind/ns/name', () => {
    expect(new KubeObject({ kind: 'Pod', metadata: { uid: 'abc', name: 'p1', namespace: 'ns' } }).getId()).toBe('abc');
    expect(new KubeObject({ kind: 'Pod', metadata: { name: 'p1', namespace: 'ns' } }).getId()).toBe('Pod/ns/p1');
  });

  it('exposes owner, labels and search text', () => {
    const o = new KubeObject({
      kind: 'Pod',
      metadata: { name: 'web-abc', namespace: 'shop', labels: { app: 'web' }, ownerReferences: [{ kind: 'ReplicaSet', name: 'web-59', uid: 'x' }] },
    });
    expect(o.getOwner()).toBe('ReplicaSet/web-59');
    expect(o.searchText()).toContain('app=web');
    expect(o.searchText()).toContain('shop');
  });

  it('computes a human age from the creation timestamp', () => {
    const iso = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
    expect(new KubeObject({ kind: 'Pod', metadata: { name: 'p', creationTimestamp: iso } }).getAge()).toBe('3h');
  });
});
