import { Watch, KubeConfig } from '@kubernetes/client-node';
import type { ResourceDescriptor, WatchEvent, WatchEventType } from '@shared/types';
import { resourcePath } from './resources';

/**
 * A single live watch on one kind (optionally namespace-scoped). Watching without
 * a resourceVersion makes the API server replay the current set as ADDED events and
 * then stream live changes — so the renderer store fills and stays live from one
 * stream. On stream end/error we transparently reconnect; the store keys by uid, so
 * the replayed ADDEDs simply refresh existing rows.
 */
export class WatchHandle {
  private controller?: AbortController;
  private stopped = false;

  constructor(
    private readonly getKc: () => Promise<KubeConfig | undefined>,
    private readonly r: ResourceDescriptor,
    private readonly namespace: string | undefined,
    private readonly emit: (e: WatchEvent) => void,
  ) {}

  start(): void { void this.open(); }

  private async open(): Promise<void> {
    if (this.stopped) return;
    const kc = await this.getKc();
    if (!kc) { this.reconnect(new Error('session gone')); return; }
    const path = resourcePath(this.r, this.r.namespaced ? this.namespace : undefined);
    try {
      this.controller = await new Watch(kc).watch(
        path,
        {},
        (phase, obj) => {
          if (this.stopped) return;
          this.emit({ type: phase as WatchEventType, object: obj });
        },
        (err) => { if (!this.stopped) this.reconnect(err); },
      );
    } catch (err) {
      if (!this.stopped) this.reconnect(err);
    }
  }

  private reconnect(err: unknown): void {
    const msg = (err as { message?: string })?.message;
    if (msg) this.emit({ type: 'ERROR', message: msg });
    setTimeout(() => this.open(), 1500);
  }

  stop(): void {
    this.stopped = true;
    try { this.controller?.abort(); } catch { /* already aborted */ }
  }
}
