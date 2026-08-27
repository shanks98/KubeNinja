import { randomUUID } from 'node:crypto';
import type { ActionLogEntry } from '@shared/types';

/**
 * A local audit of every mutating operation. Slice 1 keeps it in memory for the
 * session; Slice 2 will back this with SQLite (better-sqlite3) and feed the Cases
 * timeline. The record() API is stable so that migration is drop-in.
 */
class ActionLog {
  private entries: ActionLogEntry[] = [];

  record(e: Omit<ActionLogEntry, 'id' | 'ts'>): ActionLogEntry {
    const entry: ActionLogEntry = { id: randomUUID(), ts: Date.now(), ...e };
    this.entries.unshift(entry);
    if (this.entries.length > 1000) this.entries.length = 1000;
    return entry;
  }

  list(): ActionLogEntry[] {
    return this.entries;
  }
}

export const actionLog = new ActionLog();
