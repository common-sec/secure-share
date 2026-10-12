// Lets a host reload the page without losing the room.
// IndexedDB can store non-extractable CryptoKeys, so private keys are never exportable or visible
// as data. Records expire after a day and are deleted when the host closes the room.
import type { HostSnapshot } from './room.js';

const DB = 'uss-hosts';
const STORE = 'rooms';
const TTL_MS = 24 * 60 * 60 * 1000;

export type HostRecord = HostSnapshot & { savedAt: number };

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const conn = await db();
  return new Promise((resolve, reject) => {
    const t = conn.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { conn.close(); resolve(req.result); };
    t.onerror = () => { conn.close(); reject(t.error); };
  });
}

export async function saveHost(app: string, snapshot: HostSnapshot): Promise<void> {
  try {
    await tx('readwrite', (s) => s.put({ ...snapshot, savedAt: Date.now() } satisfies HostRecord, `${app}:${snapshot.roomId}`));
  } catch { /* private mode etc. */ }
}

export async function loadHost(app: string, roomId: string, hostFp: string): Promise<HostRecord | null> {
  try {
    const rec = (await tx('readonly', (s) => s.get(`${app}:${roomId}`))) as HostRecord | undefined;
    if (!rec || rec.hostFp !== hostFp) return null;
    if (Date.now() - rec.savedAt > TTL_MS) { await forgetHost(app, roomId); return null; }
    return rec;
  } catch {
    return null;
  }
}

export async function forgetHost(app: string, roomId: string): Promise<void> {
  try { await tx('readwrite', (s) => s.delete(`${app}:${roomId}`)); } catch { /* ignore */ }
}

/**
 * Holds an exclusive lock for this room while the tab is alive, so that opening the host's own
 * link in a second tab joins as a guest instead of creating a second host.
 * Resolves to a release function, or null if another tab already hosts the room.
 */
export function claimHost(app: string, roomId: string): Promise<(() => void) | null> {
  if (!navigator.locks) return Promise.resolve(() => {});
  return new Promise((resolve) => {
    navigator.locks.request(`uss-host:${app}:${roomId}`, { ifAvailable: true }, (lock) => {
      if (!lock) { resolve(null); return undefined; }
      return new Promise<void>((release) => resolve(() => release()));
    });
  });
}
