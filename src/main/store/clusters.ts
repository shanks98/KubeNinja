import { randomUUID } from 'node:crypto';
import type { ClusterProfile } from '@shared/types';
import { db } from './db';

/**
 * Remembers clusters the user has connected to, so they persist across restarts.
 * Only non-secret metadata is stored — never AWS credentials. Reconnecting re-mints
 * a token from creds supplied at that moment (or reused from a live same-region
 * session), so nothing here is enough to reach a cluster on its own.
 */
export const clusterProfiles = {
  list(): ClusterProfile[] {
    return [...db.get().clusters].sort(
      (a, b) => (b.lastConnectedAt ?? b.addedAt) - (a.lastConnectedAt ?? a.addedAt),
    );
  },

  get(id: string): ClusterProfile | undefined {
    return db.get().clusters.find((c) => c.id === id);
  },

  /**
   * Upsert by (name, region): connecting a cluster we already know refreshes its
   * cached endpoint/CA/version rather than creating a duplicate row.
   */
  save(p: { name: string; region: string; endpoint: string; caData: string; version: string; awsEndpoint?: string }): ClusterProfile {
    const d = db.get();
    const existing = d.clusters.find((x) => x.name === p.name && x.region === p.region);
    if (existing) {
      existing.endpoint = p.endpoint;
      existing.caData = p.caData;
      existing.version = p.version;
      existing.awsEndpoint = p.awsEndpoint;
      existing.lastConnectedAt = Date.now();
      db.save();
      return existing;
    }
    const created: ClusterProfile = { id: randomUUID(), addedAt: Date.now(), lastConnectedAt: Date.now(), ...p };
    d.clusters.push(created);
    db.save();
    return created;
  },

  /**
   * Register several clusters from just their name + region (an `aws eks` list),
   * without connecting. Existing ones are left untouched; new ones are added with no
   * endpoint/version yet — those fill in the first time the cluster is connected.
   */
  saveManyNames(items: { name: string; region: string }[]): ClusterProfile[] {
    const d = db.get();
    for (const it of items) {
      const name = it.name.trim();
      const region = it.region.trim();
      if (!name || !region) continue;
      if (!d.clusters.some((c) => c.name === name && c.region === region)) {
        d.clusters.push({ id: randomUUID(), name, region, addedAt: Date.now() });
      }
    }
    db.save();
    return this.list();
  },

  remove(id: string): void {
    const d = db.get();
    d.clusters = d.clusters.filter((c) => c.id !== id);
    db.save();
  },
};
