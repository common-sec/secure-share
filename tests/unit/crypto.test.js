import { test, assert } from './harness.js';
import * as C from '../../build/modules/lib/crypto.js';
import { utf8 } from '../../build/modules/lib/encoding.js';

const room = C.randomId(16);
const secret = C.randomId(32);

test('both sides derive interoperable keys from link + passphrase', async () => {
  const a = await C.deriveRoomKeys(room, secret, 'orbit-lemmon');
  const b = await C.deriveRoomKeys(room, secret, 'orbit-lemmon');
  assert.equal(a.signalingPassword, b.signalingPassword);
  const sealed = await C.seal(a.groupKey, utf8.encode('hello'));
  assert.equal(new TextDecoder().decode(await C.open(b.groupKey, sealed)), 'hello');
  const p = await C.proof(a.authKey, 'x', 'y');
  assert.ok(await C.checkProof(b.authKey, p, 'x', 'y'));
});

test('the passphrase changes the group key but not the signaling password', async () => {
  // The signaling password is published (encrypted offers on relays), so it must not depend on
  // the passphrase, or the passphrase could be brute-forced offline.
  const a = await C.deriveRoomKeys(room, secret, 'right-pass');
  const b = await C.deriveRoomKeys(room, secret, 'wrong-pass');
  assert.equal(a.signalingPassword, b.signalingPassword);
  const sealed = await C.seal(a.groupKey, utf8.encode('secret'));
  await assert.rejects(C.open(b.groupKey, sealed), 'decrypting with the wrong passphrase must fail');
  assert.ok(!(await C.checkProof(b.authKey, await C.proof(a.authKey, 'n'), 'n')));
});

test('different rooms or link secrets give unrelated keys', async () => {
  const a = await C.deriveRoomKeys(room, secret, 'pw');
  const b = await C.deriveRoomKeys(C.randomId(16), secret, 'pw');
  const c = await C.deriveRoomKeys(room, C.randomId(32), 'pw');
  assert.notEqual(a.signalingPassword, b.signalingPassword);
  assert.notEqual(a.signalingPassword, c.signalingPassword);
  const sealed = await C.seal(a.groupKey, utf8.encode('x'));
  await assert.rejects(C.open(b.groupKey, sealed));
  await assert.rejects(C.open(c.groupKey, sealed));
});

test('invalid link secrets are rejected', async () => {
  await assert.rejects(C.deriveRoomKeys(room, 'short', 'pw'));
  await assert.rejects(C.deriveRoomKeys(room, C.randomId(31), 'pw'));
});

test('AES-GCM detects any tampering', async () => {
  const { groupKey } = await C.deriveRoomKeys(room, secret, 'pw');
  const sealed = await C.seal(groupKey, utf8.encode('integrity matters'));
  for (const i of [0, 5, 12, sealed.length - 1]) {
    const copy = sealed.slice();
    copy[i] ^= 1;
    await assert.rejects(C.open(groupKey, copy), `flipping byte ${i} must be detected`);
  }
  await assert.rejects(C.open(groupKey, sealed.slice(0, 20)), 'truncated ciphertext');
});

test('seal uses a fresh IV every time', async () => {
  const { groupKey } = await C.deriveRoomKeys(room, secret, 'pw');
  const ivs = new Set();
  for (let i = 0; i < 200; i++) {
    const sealed = await C.seal(groupKey, new Uint8Array(1));
    ivs.add(sealed.slice(0, 12).join(','));
  }
  assert.equal(ivs.size, 200);
});

test('signatures verify only with the right key and data', async () => {
  const alice = await C.newIdentity();
  const mallory = await C.newIdentity();
  const sig = await C.sign(alice, 'message');
  assert.ok(await C.verify(alice.pub, 'message', sig));
  assert.ok(!(await C.verify(alice.pub, 'messagE', sig)), 'modified data');
  assert.ok(!(await C.verify(mallory.pub, 'message', sig)), 'other key');
  assert.ok(!(await C.verify(alice.pub, 'message', 'not-a-signature')), 'garbage signature');
  assert.equal(alice.fp, await C.fingerprint(alice.pub));
  assert.equal(alice.id, alice.fp.slice(0, 16));
});

test('safety codes match on both ends and differ for another connection', async () => {
  const fp = (x) => `a=fingerprint:sha-256 ${x}`;
  const ab = await C.safetyCode({ localDescription: { sdp: fp('AA:01') }, remoteDescription: { sdp: fp('BB:02') } });
  const ba = await C.safetyCode({ localDescription: { sdp: fp('BB:02') }, remoteDescription: { sdp: fp('AA:01') } });
  const am = await C.safetyCode({ localDescription: { sdp: fp('AA:01') }, remoteDescription: { sdp: fp('CC:03') } });
  assert.match(ab, /^\d{3} \d{3} \d{3} \d{3}$/);
  assert.equal(ab, ba);
  assert.notEqual(ab, am);
  assert.equal(await C.safetyCode({ localDescription: { sdp: '' }, remoteDescription: { sdp: fp('x') } }), null);
});

// ---- age (files and Share text) ----
// getRandomValues fills at most 64 KiB per call.
function randomBytes(n) {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 65_536) crypto.getRandomValues(out.subarray(i, Math.min(n, i + 65_536)));
  return out;
}

test('both sides derive the same post-quantum age identity; the passphrase changes it', async () => {
  const a = await C.deriveRoomKeys(room, secret, 'orbit-lemmon');
  const b = await C.deriveRoomKeys(room, secret, 'orbit-lemmon');
  const c = await C.deriveRoomKeys(room, secret, 'orbit-lemmon2');
  assert.match(await C.ageIdentity(a), /^AGE-SECRET-KEY-PQ-1[0-9A-Z]+$/);
  assert.match(await C.ageRecipient(a), /^age1pq1[0-9a-z]+$/);
  assert.equal(await C.ageIdentity(a), await C.ageIdentity(b));
  assert.notEqual(await C.ageIdentity(a), await C.ageIdentity(c));
});

test('age files round-trip, use the hybrid recipient, and fit the overhead bound', async () => {
  const keys = await C.deriveRoomKeys(room, secret, 'pw');
  for (const size of [0, 1, 65_536, 200_001]) {
    const bytes = randomBytes(size);
    const file = await C.ageEncrypt(keys, bytes);
    assert.ok(file.length - size <= C.ageOverhead(size), `overhead for ${size} bytes`);
    assert.deepEqual([...await C.ageDecrypt(keys, file)], [...bytes]);
  }
  const header = new TextDecoder().decode((await C.ageEncrypt(keys, new Uint8Array(1))).slice(0, 64));
  assert.match(header, /^age-encryption\.org\/v1\n-> mlkem768x25519 /);
});

test('age files fail with another passphrase, when tampered, truncated or extended', async () => {
  const keys = await C.deriveRoomKeys(room, secret, 'right');
  const wrong = await C.deriveRoomKeys(room, secret, 'wrong');
  const file = await C.ageEncrypt(keys, randomBytes(100_000));
  await assert.rejects(C.ageDecrypt(wrong, file), 'wrong passphrase');
  const flipped = file.slice(); flipped[flipped.length - 10] ^= 1;
  await assert.rejects(C.ageDecrypt(keys, flipped), 'tampered body');
  const header = file.slice(); header[30] ^= 1;
  await assert.rejects(C.ageDecrypt(keys, header), 'tampered header');
  await assert.rejects(C.ageDecrypt(keys, file.slice(0, 65_536 + 200)), 'truncated at a chunk boundary');
  const longer = new Uint8Array(file.length + 1); longer.set(file);
  await assert.rejects(C.ageDecrypt(keys, longer), 'extra trailing data');
});

test('only age files for the room identity are accepted, never passphrase (scrypt) files', async () => {
  const { loadAge } = await import('../../build/modules/vendor/age.js');
  const { age } = await loadAge();
  const keys = await C.deriveRoomKeys(room, secret, 'pw');
  const e = new age.Encrypter();
  e.setScryptWorkFactor(10);
  e.setPassphrase('pw');
  await assert.rejects(C.ageDecrypt(keys, await e.encrypt('hello')), 'passphrase file');
  const x = new age.Encrypter();
  x.addRecipient(await age.identityToRecipient(await age.generateIdentity()));
  await assert.rejects(C.ageDecrypt(keys, await x.encrypt('hello')), 'file for another recipient');
});
