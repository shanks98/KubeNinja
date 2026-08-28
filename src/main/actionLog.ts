import { randomUUID } from 'node:crypto';
import type { ActionLogEntry } from '@shared/types';
import { db } from './store/db';

/**
 * A local audit of every mutating operation. Now persisted via the JSON store so
 * it survives restarts and feeds each case's timeline (Slice 2).
 */
class ActionLog {
  record(e: Omit<ActionLogEntry, 'id' | 'ts'>): ActionLogEntry {
    const entry: ActionLogEntry = { id: randomUUID(), ts: Date.now(), ...e };
    const log = db.get().actionLog;
    log.unshift(entry);
    if (log.length > 5000) log.length = 5000;
    db.save();
    return entry;
  }

  list(): ActionLogEntry[] {
    return db.get().actionLog;
  }
}

export const actionLog = new ActionLog();
