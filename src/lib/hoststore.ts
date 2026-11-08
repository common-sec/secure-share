// Lets a host reload the page without losing the room, and nothing more.
// IndexedDB can store non-extractable CryptoKeys, so private keys are never exportable or visible
// as data. The open page re-saves its record every HEARTBEAT_MS and when it's hidden or unloaded;
// a record that hasn't been refreshed for RELOAD_GRACE_MS belongs to a closed tab and is useless
// (and deleted), as is one past the room's time limit. Closing the room deletes it at once.
//
// Phones are the exception: they freeze a background tab (no heartbeat) and may later discard it,
// reloading it when the user comes back. A record saved as the page went to the background is
// therefore kept for BACKGROUND_GRACE_MS, but only that same tab can resume from it after
// RELOAD_GRACE_MS: the tab proves it with a sessionStorage marker (`sameTab`), which a closed tab
// loses and a new tab never has. Anyone else opening the link joins as a guest, as before.
import { DEFAULT_LIFETIME_MS, type HostSnapshot } from './room.js';

const DB = 'uss-hosts';
const STORE = 'rooms';
export const HEARTBEAT_MS = 30 * 1000;
// Longer than a reload, and than the once-a-minute timers browsers allow background tabs.
export const RELOAD_GRACE_MS = 2 * 60 * 1000;
// How long a phone may keep the host's tab in the background and still resume the room.
export const BACKGROUND_GRACE_MS = 30 * 60 * 1000;

/** `background`: saved as the page went to the background (it may be frozen or discarded next). */
export type HostRecord = HostSnapshot & { savedAt: number; background?: boolean };

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

export async function saveHost(app: string, snapshot: HostSnapshot, { background = false } = {}): Promise<void> {
  try {
    const rec: HostRecord = { ...snapshot, savedAt: Date.now(), ...(background ? { background } : {}) };
    await tx('readwrite', (s) => s.put(rec, `${app}:${snapshot.roomId}`));
  } catch { /* private mode etc. */ }
}

const expired = (rec: HostRecord, now: number): boolean => now >= (rec.expiresAt ?? rec.savedAt + DEFAULT_LIFETIME_MS);

/** No tab can ever resume from it again: delete it. */
const isDead = (rec: HostRecord, now = Date.now()): boolean =>
  expired(rec, now) || now - rec.savedAt > (rec.background ? BACKGROUND_GRACE_MS : RELOAD_GRACE_MS);

/** Whether this tab may resume from it (`sameTab`: this tab hosted the room before). */
const isUsable = (rec: HostRecord, sameTab: boolean, now = Date.now()): boolean =>
  !isDead(rec, now) && (now - rec.savedAt <= RELOAD_GRACE_MS || (sameTab && rec.background === true));

export async function loadHost(app: string, roomId: string, hostFp: string, { sameTab = false } = {}): Promise<HostRecord | null> {
  try {
    const rec = (await tx('readonly', (s) => s.get(`${app}:${roomId}`))) as HostRecord | undefined;
    if (!rec || rec.hostFp !== hostFp) return null;
    if (isDead(rec)) { await forgetHost(app, roomId); return null; }
    // Not for this tab, but the host's own background tab may still come back to it.
    return isUsable(rec, sameTab) ? rec : null;
  } catch {
    return null;
  }
}

export async function forgetHost(app: string, roomId: string): Promise<void> {
  try { await tx('readwrite', (s) => s.delete(`${app}:${roomId}`)); } catch { /* ignore */ }
}

/** Deletes every record a reload can no longer use (closed tabs, rooms past their time limit). */
export async function sweepHosts(): Promise<void> {
  try {
    const conn = await db();
    await new Promise<void>((resolve, reject) => {
      const t = conn.transaction(STORE, 'readwrite');
      const req = t.objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        if (isDead(cursor.value as HostRecord)) cursor.delete();
        cursor.continue();
      };
      t.oncomplete = () => { conn.close(); resolve(); };
      t.onerror = () => { conn.close(); reject(t.error); };
    });
  } catch { /* private mode etc. */ }
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
