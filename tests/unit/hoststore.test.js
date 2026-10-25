// The saved host state only serves a reload: stale or expired records are refused and deleted.
import { test, assert } from './harness.js';
import { saveHost, loadHost, sweepHosts, RELOAD_GRACE_MS } from '../../build/modules/lib/hoststore.js';

const ageKey = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
const record = (roomId, extra = {}) => ({ roomId, secret: 's', hostFp: 'fp', nick: 'A', identity: {}, keys: { ageKey }, approved: [], expiresAt: Date.now() + 60_000, ...extra });

// Writes a record directly, with a chosen savedAt (saveHost always uses now).
function put(key, value) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('uss-hosts', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('rooms');
    req.onsuccess = () => {
      const t = req.result.transaction('rooms', 'readwrite');
      t.objectStore('rooms').put(value, key);
      t.oncomplete = () => { req.result.close(); resolve(); };
      t.onerror = () => reject(t.error);
    };
    req.onerror = () => reject(req.error);
  });
}

test('a fresh record resumes the room after a reload', async () => {
  await saveHost('t', record('fresh'));
  assert.equal((await loadHost('t', 'fresh', 'fp'))?.roomId, 'fresh');
  assert.equal(await loadHost('t', 'fresh', 'other-fp'), null, 'the host key must match the link');
});

test('a record from a closed tab is refused and deleted', async () => {
  await put('t:closed', { ...record('closed'), savedAt: Date.now() - RELOAD_GRACE_MS - 1000 });
  assert.equal(await loadHost('t', 'closed', 'fp'), null);
  await put('t:closed', { ...record('closed'), savedAt: Date.now() });
  assert.ok(await loadHost('t', 'closed', 'fp'), 'only stale records are refused');
});

test('a record past the room time limit is refused', async () => {
  await saveHost('t', record('expired', { expiresAt: Date.now() - 1 }));
  assert.equal(await loadHost('t', 'expired', 'fp'), null);
});

test('the sweep deletes every stale record and keeps live ones', async () => {
  await put('t:old', { ...record('old'), savedAt: Date.now() - RELOAD_GRACE_MS - 1000 });
  await saveHost('t', record('live'));
  await sweepHosts();
  assert.ok(await loadHost('t', 'live', 'fp'));
  // A swept record is gone even if it were fresh again now: read it raw.
  const raw = await new Promise((resolve) => {
    const req = indexedDB.open('uss-hosts', 1);
    req.onsuccess = () => {
      const g = req.result.transaction('rooms').objectStore('rooms').get('t:old');
      g.onsuccess = () => { req.result.close(); resolve(g.result); };
    };
  });
  assert.equal(raw, undefined);
});

test('a record saved before protocol v3 (no age key) is refused and deleted', async () => {
  await saveHost('t', record('v2', { keys: {} }));
  assert.equal(await loadHost('t', 'v2', 'fp'), null);
  await saveHost('t', record('v2'));
  assert.ok(await loadHost('t', 'v2', 'fp'), 'the same record with an age key resumes');
});
