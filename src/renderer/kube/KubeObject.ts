import type { RawKubeObject, RawKubeMeta } from '@shared/types';

/**
 * A thin wrapper over a raw API object giving the typed accessors the UI needs
 * (Freelens's KubeObject, minus the class-per-kind hierarchy — per-kind behaviour
 * lives in the column registry instead). Keyed by metadata.uid for the store.
 */
export class KubeObject {
  readonly raw: RawKubeObject;
  constructor(raw: RawKubeObject) { this.raw = raw; }

  get metadata(): RawKubeMeta { return this.raw.metadata; }
  get spec(): Record<string, unknown> { return (this.raw.spec ?? {}) as Record<string, unknown>; }
  get status(): Record<string, unknown> { return (this.raw.status ?? {}) as Record<string, unknown>; }

  getId(): string {
    return this.metadata.uid ?? `${this.raw.kind}/${this.metadata.namespace ?? '~'}/${this.metadata.name}`;
  }
  getName(): string { return this.metadata.name ?? ''; }
  getNs(): string | undefined { return this.metadata.namespace; }
  getKind(): string { return this.raw.kind ?? ''; }
  getLabels(): Record<string, string> { return this.metadata.labels ?? {}; }
  getAnnotations(): Record<string, string> { return this.metadata.annotations ?? {}; }
  getCreationTimestamp(): string | undefined { return this.metadata.creationTimestamp; }
  isDeleting(): boolean { return !!this.metadata.deletionTimestamp; }

  getOwner(): string | undefined {
    const o = this.metadata.ownerReferences?.[0];
    return o ? `${o.kind}/${o.name}` : undefined;
  }

  getAge(): string {
    const t = this.getCreationTimestamp();
    if (!t) return '';
    const s = Math.floor((Date.now() - new Date(t).getTime()) / 1000);
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  }
  /** Seconds since creation — for age sorting. */
  getAgeSeconds(): number {
    const t = this.getCreationTimestamp();
    return t ? (Date.now() - new Date(t).getTime()) / 1000 : Number.MAX_SAFE_INTEGER;
  }

  /** Free-text haystack for the search box. */
  searchText(): string {
    return `${this.getName()} ${this.getNs() ?? ''} ${Object.entries(this.getLabels()).map(([k, v]) => `${k}=${v}`).join(' ')}`.toLowerCase();
  }
}
