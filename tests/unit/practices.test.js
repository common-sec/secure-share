// Cryptographic good practice, checked as properties of the real code.
//
// The other test files check that features work and that specific attacks fail. This one pins
// down the habits that keep the cryptography sound, so that a refactor that weakens one of them
// (an extractable key, a reused IV, fewer KDF iterations, a secret that ends up in the link or in
// storage) fails a test instead of passing unnoticed:
//
//   keys        derived exactly as docs/PROTOCOL.md §2 says, never extractable, one use each
//   encryption  AES-256-GCM with a fresh 96-bit IV and a full 128-bit tag; any change is detected
//   proofs      and signatures fail closed on malformed input, and are bound to their room
//   randomness  identifiers have the documented size and never repeat
//   sessions    nothing is reused between rooms; the passphrase stays out of links and storage
//   relays      what Symbolon publishes: fresh nonces, separated contexts, strict sizes
//
// At the end, test.todo() lists the guarantees the protocol doesn't give yet. They come from the
// security analysis of 2026-11-14 (ids SS-1 to SS-8) and are backlog items: each one becomes a
// real test in the change that provides the guarantee.
import { test, assert } from './harness.js';
import { FakeNetwork } from './fake-transport.js';
import { SecureRoom } from '../../build/modules/lib/room.js';
import * as C from '../../build/modules/lib/crypto.js';
import * as R from '../../build/modules/lib/relay-seal.js';
import { loadSymbolon } from '../../build/modules/vendor/symbolon.js';
import { b64urlToBytes, bytesToB64url, utf8 } from '../../build/modules/lib/encoding.js';

const PASS = 'karrot-behind-stonish';
const B64URL = /^[A-Za-z0-9_-]+$/;
const subtle = crypto.subtle;
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
};

// ---------------------------------------------------------------- keys
test('practice: room keys and identity keys cannot be exported, and each has one job', async () => {
  // A non-extractable key can be used by the page but never read by it, so a bug (or injected
  // script) that gets hold of the object still can't send the key anywhere or store it as bytes.
  const keys = await C.deriveRoomKeys(C.randomId(16), C.randomId(32), PASS);
  assert.equal(keys.groupKey.extractable, false, 'group key');
  assert.equal(keys.authKey.extractable, false, 'auth key');
  assert.equal(keys.groupKey.algorithm.name, 'AES-GCM');
  assert.equal(keys.groupKey.algorithm.length, 256, 'AES-256, not 128');
  assert.deepEqual([...keys.groupKey.usages].sort(), ['decrypt', 'encrypt']);
  assert.equal(keys.authKey.algorithm.name, 'HMAC');
  assert.equal(keys.authKey.algorithm.hash.name, 'SHA-256');
  assert.deepEqual([...keys.authKey.usages].sort(), ['sign', 'verify']);
  await assert.rejects(subtle.exportKey('raw', keys.groupKey), 'the group key must not export');
  await assert.rejects(subtle.exportKey('raw', keys.authKey), 'the auth key must not export');

  const id = await C.newIdentity();
  assert.equal(id.privateKey.extractable, false, 'identity private key');
  assert.equal(id.privateKey.algorithm.name, 'ECDSA');
  assert.equal(id.privateKey.algorithm.namedCurve, 'P-256');
  assert.deepEqual([...id.privateKey.usages], ['sign']);
  await assert.rejects(subtle.exportKey('pkcs8', id.privateKey), 'the private key must not export');
  await assert.rejects(subtle.exportKey('jwk', id.privateKey), 'not as JWK either');
});

test('practice: keys are derived exactly as PROTOCOL.md §2 specifies (independent derivation)', async () => {
  // The derivation is written out again here, straight from the specification, and must give keys
  // that interoperate with the app's. Changing the iteration count, a hash, a salt or a label in
  // src/lib/crypto.ts (a silent downgrade, or an accidental protocol break) fails this test.
  const roomId = C.randomId(16);
  const secret = C.randomId(32);
  const keys = await C.deriveRoomKeys(roomId, secret, PASS);

  const salt = utf8.encode(`uss/v2/${roomId}`);
  const hkdf = (info) => ({ name: 'HKDF', hash: 'SHA-256', salt, info: utf8.encode(info) });
  const link = b64urlToBytes(secret);
  const linkKey = await subtle.importKey('raw', link, 'HKDF', false, ['deriveBits']);
  const signaling = new Uint8Array(await subtle.deriveBits(hkdf('signaling'), linkKey, 256));
  assert.equal(keys.signalingPassword, bytesToB64url(signaling), 'signaling = HKDF(link secret)');

  const pwKey = await subtle.importKey('raw', utf8.encode(PASS.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const pw = new Uint8Array(await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600_000 }, pwKey, 256));
  const base = await subtle.importKey('raw', concat(link, pw), 'HKDF', false, ['deriveKey']);
  const group = await subtle.deriveKey(hkdf('group'), base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const auth = await subtle.deriveKey(hkdf('auth'), base, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign']);

  const iv = rand(12);
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, group, utf8.encode('spec')));
  assert.equal(new TextDecoder().decode(await C.open(keys.groupKey, concat(iv, ct))), 'spec', 'group key matches the spec');
  const mac = bytesToB64url(new Uint8Array(await subtle.sign('HMAC', auth, utf8.encode('a|b'))));
  assert.ok(await C.checkProof(keys.authKey, mac, 'a', 'b'), 'auth key matches the spec');
});

test('practice: the passphrase is normalised (NFKC), and nothing else about it is', async () => {
  // The same passphrase typed on two keyboards can arrive as different code points. NFKC makes
  // them one. Case and spacing stay significant: folding them would shrink the space of guesses.
  const roomId = C.randomId(16);
  const secret = C.randomId(32);
  const opens = async (a, b) => {
    const [ka, kb] = await Promise.all([C.deriveRoomKeys(roomId, secret, a), C.deriveRoomKeys(roomId, secret, b)]);
    try { await C.open(kb.groupKey, await C.seal(ka.groupKey, utf8.encode('x'))); return true; } catch { return false; }
  };
  assert.ok(await opens('ofﬁce café', 'office café'), 'ligature and combining accent');
  assert.ok(!await opens('Orbit lemon', 'orbit lemon'), 'case matters');
  assert.ok(!await opens('orbit lemon', 'orbit  lemon'), 'spacing matters');
  assert.ok(!await opens('orbit lemon', 'orbit lemon '), 'a trailing space matters');
});

test('practice: link secrets of the wrong size or alphabet are refused, never padded or cut', async () => {
  const roomId = C.randomId(16);
  for (const bad of [C.randomId(31), C.randomId(33), C.randomId(16), '', `${C.randomId(32).slice(0, 42)}=`, `${C.randomId(32).slice(0, 42)}+`]) {
    await assert.rejects(C.deriveRoomKeys(roomId, bad, PASS), `refused ${JSON.stringify(bad)}`);
  }
});

// ---------------------------------------------------------------- encryption
test('practice: every sealed message has its own 96-bit IV and a full 128-bit tag', async () => {
  // AES-GCM loses both secrecy and integrity if an IV repeats under one key. IVs are random, so
  // the check is statistical: 2,000 messages, no repeat, and no fixed or counting pattern.
  const { groupKey } = await C.deriveRoomKeys(C.randomId(16), C.randomId(32), PASS);
  const plain = utf8.encode('same message every time');
  const ivs = new Set();
  let firstBytes = new Set();
  for (let i = 0; i < 2000; i++) {
    const sealed = await C.seal(groupKey, plain);
    assert.equal(sealed.length, 12 + plain.length + 16, 'IV (12) + ciphertext + tag (16)');
    ivs.add(bytesToB64url(sealed.subarray(0, 12)));
    firstBytes.add(sealed[0]);
  }
  assert.equal(ivs.size, 2000, 'no IV was used twice');
  assert.atLeast(firstBytes.size, 200, 'IVs are random, not a counter or a constant prefix');
}, { timeout: 60000 });

test('practice: a change to any byte, or any missing byte, is detected', async () => {
  // crypto.test.js flips one byte. Here it is every byte in turn (IV, ciphertext and tag) and
  // every possible truncation, so no part of a sealed message is left unauthenticated.
  const { groupKey } = await C.deriveRoomKeys(C.randomId(16), C.randomId(32), PASS);
  const sealed = await C.seal(groupKey, utf8.encode('sixteen byte msg'));
  for (let i = 0; i < sealed.length; i++) {
    const changed = sealed.slice();
    changed[i] ^= 0x01;
    await assert.rejects(C.open(groupKey, changed), `byte ${i} changed`);
  }
  for (let n = 0; n < sealed.length; n++) {
    await assert.rejects(C.open(groupKey, sealed.slice(0, n)), `cut to ${n} bytes`);
  }
  await assert.rejects(C.open(groupKey, concat(sealed, new Uint8Array(1))), 'a byte added');
  assert.equal((await C.open(groupKey, sealed)).length, 16, 'the untouched message still opens');
});

// ---------------------------------------------------------------- proofs and signatures
test('practice: a passphrase proof covers every field and only works in its own room', async () => {
  const secret = C.randomId(32);
  const a = await C.deriveRoomKeys(C.randomId(16), secret, PASS);
  const fields = ['uss-join', 'nonceH', 'nonceG', 'pub', 'nick'];
  const p = await C.proof(a.authKey, ...fields);
  assert.ok(await C.checkProof(a.authKey, p, ...fields));
  for (let i = 0; i < fields.length; i++) {
    const other = fields.map((f, j) => (j === i ? `${f}x` : f));
    assert.ok(!await C.checkProof(a.authKey, p, ...other), `field ${i} is covered`);
  }
  // Same link secret and passphrase in another room: the room id is in the KDF salt.
  const b = await C.deriveRoomKeys(C.randomId(16), secret, PASS);
  assert.ok(!await C.checkProof(b.authKey, p, ...fields), 'not valid in another room');
});

test('practice: malformed or shortened proofs and signatures are refused without an exception', async () => {
  // Verification takes input from a peer. It must answer false for anything that isn't a full,
  // valid value: a truncated MAC must not be accepted as a "prefix match", and junk must not throw
  // (an exception here would end the handshake with an error the peer can tell apart).
  const { authKey } = await C.deriveRoomKeys(C.randomId(16), C.randomId(32), PASS);
  const p = await C.proof(authKey, 'x');
  for (const bad of ['', p.slice(0, -1), p.slice(0, 22), `${p}A`, 'not base64url!', '====']) {
    assert.equal(await C.checkProof(authKey, bad, 'x'), false, `proof ${JSON.stringify(bad)}`);
  }

  const id = await C.newIdentity();
  const other = await C.newIdentity();
  const sig = await C.sign(id, 'message');
  assert.ok(await C.verify(id.pub, 'message', sig));
  assert.equal(b64urlToBytes(sig).length, 64, 'ECDSA P-256 signature, raw r||s');
  for (const bad of ['', sig.slice(0, -2), `${sig}AA`, 'not base64url!', await C.sign(other, 'message')]) {
    assert.equal(await C.verify(id.pub, 'message', bad), false, `signature ${JSON.stringify(bad).slice(0, 24)}`);
  }
  // Public keys that aren't a point on P-256: empty, short, all zeros, the right size but random.
  const notAKey = ['', 'AAAA', bytesToB64url(new Uint8Array(65)), bytesToB64url(concat(new Uint8Array([4]), rand(64))), 'not base64url!'];
  for (const bad of notAKey) {
    assert.equal(await C.verify(bad, 'message', sig), false, `public key ${JSON.stringify(bad).slice(0, 24)}`);
  }
});

test('practice: identities are fresh, and their id is bound to the public key', async () => {
  const a = await C.newIdentity();
  const b = await C.newIdentity();
  assert.notEqual(a.pub, b.pub, 'a new key pair every time');
  assert.equal(b64urlToBytes(a.pub).length, 65, 'uncompressed P-256 point');
  assert.equal(b64urlToBytes(a.pub)[0], 4);
  assert.equal(a.fp, await C.fingerprint(a.pub), 'fingerprint = SHA-256(public key)');
  assert.equal(b64urlToBytes(a.fp).length, 32, 'the full hash, not a truncation');
  assert.equal(a.id, a.fp.slice(0, 16));
});

// ---------------------------------------------------------------- randomness
test('practice: random identifiers have the documented size and never repeat', () => {
  const sizes = [[12, 16], [16, 22], [32, 43]]; // bytes -> base64url characters
  for (const [bytes, chars] of sizes) {
    const seen = new Set();
    for (let i = 0; i < 1000; i++) {
      const id = C.randomId(bytes);
      assert.equal(id.length, chars);
      assert.match(id, B64URL);
      seen.add(id);
    }
    assert.equal(seen.size, 1000, `${bytes}-byte identifiers don't repeat`);
  }
});

test('practice: the safety code is the same from both ends, however the SDP is written', async () => {
  const fpA = 'AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89';
  const fpB = fpA.replace(/^AB/, '12');
  const sdp = (fp, alg = 'sha-256') => ({ sdp: `v=0\r\na=fingerprint:${alg} ${fp}\r\n` });
  const mine = await C.safetyCode({ localDescription: sdp(fpA), remoteDescription: sdp(fpB) });
  const theirs = await C.safetyCode({ localDescription: sdp(fpB), remoteDescription: sdp(fpA) });
  assert.match(mine, /^\d{3} \d{3} \d{3} \d{3}$/);
  assert.equal(mine, theirs, 'both ends');
  const relaxed = await C.safetyCode({ localDescription: sdp(fpA.toLowerCase(), 'SHA-256'), remoteDescription: sdp(fpB) });
  assert.equal(relaxed, mine, 'letter case of the SDP line does not change the code');
  // No code is better than a code computed from half the information.
  assert.equal(await C.safetyCode({ localDescription: sdp(fpA), remoteDescription: { sdp: 'v=0\r\n' } }), null);
  assert.equal(await C.safetyCode({ localDescription: sdp(fpA) }), null);
  assert.equal(await C.safetyCode(undefined), null);
});

// ---------------------------------------------------------------- sessions
const hostRoom = (net, opts = {}) => SecureRoom.host({ app: 'test', passphrase: PASS, nick: 'Alice', transport: net.transport(), ...opts });

test('practice: every room gets a new id, link secret and host key', async () => {
  const net = new FakeNetwork();
  const a = await hostRoom(net);
  const b = await hostRoom(net);
  assert.notEqual(a.roomId, b.roomId);
  assert.notEqual(a.secret, b.secret);
  assert.notEqual(a.hostFp, b.hostFp, 'the host key is per room, so rooms cannot be linked by it');
  assert.equal(b64urlToBytes(a.roomId).length, 16);
  assert.equal(b64urlToBytes(a.secret).length, 32, '256-bit link secret');
  a.leave(); b.leave();
});

test('practice: the link carries the room id, link secret and host fingerprint, in the fragment, and nothing else', async () => {
  // The fragment is never sent to the server that hosts the page. The passphrase travels by
  // another channel and must not appear in the link in any form.
  const net = new FakeNetwork();
  const host = await hostRoom(net);
  const link = new URL(host.link('https://share.example/chat/'));
  assert.equal(link.search, '', 'nothing in the query string, which servers log');
  const params = new URLSearchParams(link.hash.slice(1));
  assert.deepEqual([...params.keys()].sort(), ['h', 'k', 'r']);
  assert.equal(params.get('r'), host.roomId);
  assert.equal(params.get('k'), host.secret);
  assert.equal(params.get('h'), host.identity.fp, 'the full fingerprint of the host key');
  assert.ok(!link.href.includes(PASS) && !link.href.includes(encodeURIComponent(PASS)), 'no passphrase');
  host.leave();
});

test('practice: what a host stores to survive a reload holds no passphrase and no exportable key', async () => {
  const net = new FakeNetwork();
  const host = await hostRoom(net);
  const snap = host.snapshot();
  // This object is what src/lib/hoststore.ts writes to IndexedDB, as it is.
  const stored = snap;
  assert.deepEqual(Object.keys(stored).sort(), ['approved', 'expiresAt', 'hostFp', 'identity', 'keys', 'nick', 'roomId', 'secret']);
  const strings = [];
  const walk = (v) => {
    if (typeof v === 'string') strings.push(v);
    else if (v instanceof CryptoKey) assert.equal(v.extractable, false, 'stored keys stay non-extractable');
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(stored);
  assert.ok(strings.every((s) => !s.includes(PASS)), 'the passphrase is not stored');
  assert.equal(stored.identity.privateKey.extractable, false);
  host.leave();
});

test('practice: a guest whose link names another host key never connects', async () => {
  // The fingerprint in the link is what tells a guest which host to trust. If it doesn't match
  // the key the host presents, the guest must stop, even with the right secret and passphrase.
  const net = new FakeNetwork();
  const host = await hostRoom(net);
  const wrong = (await C.newIdentity()).fp;
  const guest = await SecureRoom.join({ app: 'test', roomId: host.roomId, secret: host.secret, hostFp: wrong, passphrase: PASS, nick: 'Bob', transport: net.transport() });
  let connected = false;
  guest.addEventListener('connected', () => { connected = true; });
  await new Promise((r) => setTimeout(r, 1200));
  assert.equal(connected, false);
  assert.equal(guest.hostPeerId, null);
  assert.equal(host.guests.size, 0, 'and the host has no pending guest');
  host.leave(); guest.leave();
});

test('practice: the host opens every handshake with only its public key and a new nonce', async () => {
  // A peer that listens to the start of two handshakes sees the host's public key (which the
  // link already commits to) and a nonce that is new each time, so a recorded handshake can't
  // be played back. Nothing here depends on the passphrase.
  const net = new FakeNetwork();
  const host = await hostRoom(net);
  const listen = () => new Promise((resolve) => {
    net.transport().joinRoom({ appId: 'secure-share.test.v3', password: host.keys.signalingPassword }, host.roomId, {
      onPeerHandshake: async (_peerId, _send, receive) => {
        resolve((await receive()).data);
        throw new Error('listener leaves');
      },
    });
  });
  const first = await listen();
  const second = await listen();
  assert.deepEqual(Object.keys(first).sort(), ['nonce', 'pub', 'role', 'v']);
  assert.equal(first.role, 'host');
  assert.equal(await C.fingerprint(first.pub), host.hostFp, 'the key the link commits to');
  assert.equal(b64urlToBytes(first.nonce).length, 16, '128-bit nonce');
  assert.notEqual(first.nonce, second.nonce, 'a new nonce for every handshake');
  host.leave();
});

// ---------------------------------------------------------------- relays (Symbolon)
const sym = await loadSymbolon();
const groupKeys = (secret, context = 'secure-share/test/v3/room') => new sym.GroupKeys(utf8.encode(context), secret);
const TOPIC = 'Trystero@secure-share.test.v3@room';

test('practice: relay messages never reuse a nonce, and are base64url only', () => {
  // XChaCha20-Poly1305 with a random 24-byte nonce: the first 24 bytes of every sealed message.
  const keys = groupKeys(rand(32));
  const signer = sym.EventSigner.generate();
  const now = R.unixNow();
  const nonces = new Set();
  for (let i = 0; i < 500; i++) {
    const { content } = JSON.parse(R.sealEvent(signer, keys, TOPIC, 'same message', now))[1];
    assert.match(content, B64URL);
    nonces.add(content.slice(0, 32));
  }
  assert.equal(nonces.size, 500);
});

test('practice: relay keys need a full 32-byte secret, given as bytes', () => {
  // A shorter secret would make the topic and seal keys guessable; a string in place of bytes
  // would silently become other bytes. Symbolon must refuse both rather than derive weak keys.
  const context = utf8.encode('secure-share/test/v3/room');
  for (const bad of [rand(31), rand(16), new Uint8Array(0), 'a'.repeat(32), Array(32).fill(1), null]) {
    assert.throws(() => new sym.GroupKeys(context, bad), `refused ${Object.prototype.toString.call(bad)}`);
  }
  assert.ok(new sym.GroupKeys(context, rand(32)));
});

test('practice: Chat and Share rooms with the same secret share no relay keys', () => {
  // The context string separates apps and rooms (PROTOCOL.md §2), so the same link secret can't
  // be made to produce the same topic or seal key somewhere else.
  const secret = rand(32);
  const chat = groupKeys(secret, 'secure-share/chat/v3/room');
  const share = groupKeys(secret, 'secure-share/share/v3/room');
  assert.notEqual(R.relayTopic(chat, TOPIC).hex, R.relayTopic(share, TOPIC).hex);
  const now = R.unixNow();
  const signer = sym.EventSigner.generate();
  const event = R.parseEvent(JSON.stringify(['EVENT', 'sub', JSON.parse(R.sealEvent(signer, chat, TOPIC, 'hello', now))[1]]), now);
  assert.equal(R.openEvent(chat, event), 'hello');
  assert.equal(R.openEvent(share, event), null);
});

test('practice: an oversized relay message is refused outright, never cut short', () => {
  const keys = groupKeys(rand(32));
  const signer = sym.EventSigner.generate();
  assert.ok(R.sealEvent(signer, keys, TOPIC, 'x'.repeat(8000)), 'a large SDP offer fits');
  assert.throws(() => R.sealEvent(signer, keys, TOPIC, 'x'.repeat(17000)), 'above Symbolon\'s 16 KiB limit');
});

test('practice: a published event holds only what a relay needs, under a key made for this page', () => {
  const keys = groupKeys(rand(32));
  const now = R.unixNow();
  const one = sym.EventSigner.generate();
  const two = sym.EventSigner.generate();
  const event = JSON.parse(R.sealEvent(one, keys, TOPIC, 'hello', now))[1];
  assert.deepEqual(Object.keys(event).sort(), ['content', 'created_at', 'id', 'kind', 'pubkey', 'sig', 'tags']);
  assert.deepEqual(event.tags, [['t', R.relayTopic(keys, TOPIC).hex], ['expiration', String(now + R.MAX_AGE_S)]]);
  assert.match(event.pubkey, /^[0-9a-f]{64}$/);
  assert.notEqual(one.publicKey, two.publicKey, 'signing keys are generated, not fixed');
  const filter = JSON.parse(sym.signalFilter(R.relayTopic(keys, TOPIC).bytes, now));
  assert.deepEqual(Object.keys(filter).sort(), ['#t', 'kinds', 'since']);
  assert.deepEqual(filter.kinds, [R.KIND]);
});

// ---------------------------------------------------------------- not guaranteed yet (backlog)
// Each line is a guarantee the documentation describes, or that good practice expects, and that
// the code doesn't give today. They are listed on every run so they aren't forgotten, and never
// fail. See the security analysis of 2026-11-14 for the reasoning and the proposed fixes.
test.todo('SS-1: a guest sends its passphrase proof only after verifying the host signature',
  'src/lib/room.ts #guestHandshake sends the proof first; reorder, no wire change');
test.todo('SS-2: the handshake is bound to the connection (both DTLS fingerprints and both keys are signed)',
  'protocol v4');
test.todo('SS-3: a guest proves it holds its identity key, and a member who left is not re-admitted without the host',
  'protocol v4, and drop the member from `approved` on leave');
test.todo('SS-4: the safety code carries at least 80 bits, or both sides commit before revealing',
  'src/lib/crypto.ts safetyCode');
test.todo('SS-5: at most 5 proofs are evaluated before the room locks, also when attempts arrive together',
  'src/lib/room.ts #hostHandshake: check the lock again after verifying');
test.todo('SS-6: a guest refuses a roster with two host entries, a repeated id, or an id that does not match its key',
  'src/lib/room.ts #onCtl; sign control messages in protocol v4');
test.todo('SS-7: a hello whose nonce or public key is not base64url of the documented length is refused',
  'src/lib/room.ts parseHello');
test.todo('SS-8: a sealed relay message is delivered once, whatever event id it arrives under',
  'src/lib/symbolon-nostr.ts: key the seen-set on the sealed nonce');
