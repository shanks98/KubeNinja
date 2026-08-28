import { app } from 'electron';
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import type { Case, Finding, Comment, Evidence, CaseEvent, ActionLogEntry } from '@shared/types';

export interface DbShape {
  cases: Case[];
  findings: Finding[];
  comments: Comment[];
  evidence: Evidence[];
  events: CaseEvent[];
  actionLog: ActionLogEntry[];
}

const EMPTY: DbShape = { cases: [], findings: [], comments: [], evidence: [], events: [], actionLog: [] };

/**
 * A tiny JSON-file store under userData — the single-user, zero-native-dependency
 * backing for the investigation Cases and the action log. Kept behind this narrow
 * interface so it can later be swapped for SQLite without touching callers.
 * Writes are atomic (temp file + rename) and debounced.
 */
class Db {
  private data: DbShape | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  private dir(): string { return join(app.getPath('userData'), 'kubeninja'); }
  private file(): string { return join(this.dir(), 'store.json'); }
  evidenceDir(): string { const d = join(this.dir(), 'evidence'); mkdirSync(d, { recursive: true }); return d; }

  get(): DbShape {
    if (this.data) return this.data;
    mkdirSync(this.dir(), { recursive: true });
    try {
      if (existsSync(this.file())) {
        const parsed = JSON.parse(readFileSync(this.file(), 'utf8')) as Partial<DbShape>;
        this.data = { ...EMPTY, ...parsed };
      } else {
        this.data = structuredClone(EMPTY);
      }
    } catch {
      this.data = structuredClone(EMPTY);
    }
    return this.data;
  }

  /** Persist now (atomically). */
  flush(): void {
    if (!this.data) return;
    const tmp = this.file() + '.tmp';
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    renameSync(tmp, this.file());
  }

  /** Mark dirty; write is coalesced on a short timer. */
  save(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => { this.saveTimer = null; try { this.flush(); } catch { /* best-effort */ } }, 200);
  }
}

export const db = new Db();
