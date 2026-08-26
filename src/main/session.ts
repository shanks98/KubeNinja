import { randomUUID } from 'node:crypto';
import type { KubeConfig } from '@kubernetes/client-node';
import type { AwsCreds } from '@shared/types';
import { eksBearerToken } from './aws/token';
import { makeKubeConfig } from './kube/client';

interface Live {
  id: string;
  name: string;
  region: string;
  endpoint: string;
  caData: string;
  version: string;
  creds: AwsCreds; // kept in memory only, to re-mint the token when it nears expiry
  kc: KubeConfig;
  tokenExpiresAt: number;
}

/**
 * Holds connected cluster sessions in memory only. AWS creds and kube tokens never
 * touch disk; they live here and are scrubbed on disconnect / app exit. Tokens are
 * re-minted transparently as they approach expiry.
 */
class SessionStore {
  private sessions = new Map<string, Live>();

  async create(creds: AwsCreds, name: string, endpoint: string, caData: string, version: string): Promise<Live> {
    const { token, expiresAt } = await eksBearerToken(creds, name);
    const kc = makeKubeConfig(name, endpoint, caData, token);
    const s: Live = { id: randomUUID(), name, region: creds.region, endpoint, caData, version, creds, kc, tokenExpiresAt: expiresAt };
    this.sessions.set(s.id, s);
    return s;
  }

  /** Return a session with a fresh-enough token, re-minting within 2 minutes of expiry. */
  async get(id: string): Promise<Live | undefined> {
    const s = this.sessions.get(id);
    if (!s) return undefined;
    if (Date.now() > s.tokenExpiresAt - 120_000) {
      const { token, expiresAt } = await eksBearerToken(s.creds, s.name);
      s.kc = makeKubeConfig(s.name, s.endpoint, s.caData, token);
      s.tokenExpiresAt = expiresAt;
    }
    return s;
  }

  remove(id: string): void {
    this.sessions.delete(id);
  }

  clear(): void {
    this.sessions.clear();
  }
}

export const sessions = new SessionStore();
