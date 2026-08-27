import { describe, it, expect } from 'vitest';
import { RESOURCES, resourceById, resourcePath } from './resources';

describe('resource registry', () => {
  it('has unique ids and parses group/version from apiVersion', () => {
    const ids = RESOURCES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(resourceById('deployments')).toMatchObject({ group: 'apps', version: 'v1', kind: 'Deployment' });
    expect(resourceById('pods')).toMatchObject({ group: '', version: 'v1' });
  });

  it('throws on an unknown id', () => {
    expect(() => resourceById('nope')).toThrow(/unknown resource/);
  });

  it('builds core namespaced paths', () => {
    expect(resourcePath(resourceById('pods'), 'kube-system')).toBe('/api/v1/namespaces/kube-system/pods');
    expect(resourcePath(resourceById('pods'))).toBe('/api/v1/pods');
  });

  it('builds grouped and cluster-scoped paths', () => {
    expect(resourcePath(resourceById('deployments'), 'default')).toBe('/apis/apps/v1/namespaces/default/deployments');
    expect(resourcePath(resourceById('nodes'), 'ignored')).toBe('/api/v1/nodes'); // cluster-scoped ignores ns
    expect(resourcePath(resourceById('ingresses'), 'web')).toBe('/apis/networking.k8s.io/v1/namespaces/web/ingresses');
  });
});
