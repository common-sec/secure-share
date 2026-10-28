// Run with: node --test tests/handshake.test.mjs (after ./build.sh)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import * as noise from '../pkg/noise_wasm.js';
import * as vec from '../pkg-vectors/noise_wasm.js';

noise.initSync({ module: readFileSync(new URL('../pkg/noise_wasm_bg.wasm', import.meta.url)) });
vec.initSync({ module: readFileSync(new URL('../pkg-vectors/noise_wasm_bg.wasm', import.meta.url)) });

const hex = (s) => Uint8Array.from(Buffer.from(s, 'hex'));
const toHex = (b) => Buffer.from(b).toString('hex');
const text = (s) => new TextEncoder().encode(s);
const random = (n) => webcrypto.getRandomValues(new Uint8Array(n));
const keypair = (lib = noise) => {
  const kp = lib.generate_keypair();
  return { priv: kp.slice(0, 32), pub: kp.slice(32) };
};
const { vectors } = JSON.parse(readFileSync(new URL('./vectors.json', import.meta.url)));
const PROLOGUE = text('commonsec-share noise prototype');

for (const v of vectors) {
  const position = Number(v.protocol_name.match(/IKpsk(\d)/)[1]);
  test(`published vector: ${v.protocol_name}`, () => {
    assert.equal(noise.protocol_name(position), v.protocol_name);
    const ini = vec.Handshake.initiator_for_vectors(position, hex(v.init_static), hex(v.init_remote_static),
      hex(v.init_psks[0]), hex(v.init_prologue), hex(v.init_ephemeral));
    const res = vec.Handshake.responder_for_vectors(position, hex(v.resp_static),
      hex(v.resp_psks[0]), hex(v.resp_prologue), hex(v.resp_ephemeral));
    const [m1, m2, ...rest] = v.messages;
    const c1 = ini.write_message(hex(m1.payload));
    assert.equal(toHex(c1), m1.ciphertext);
    assert.equal(toHex(res.read_message(c1)), m1.payload);
    const c2 = res.write_message(hex(m2.payload));
    assert.equal(toHex(c2), m2.ciphertext);
    assert.equal(toHex(ini.read_message(c2)), m2.payload);
    assert.ok(ini.is_finished() && res.is_finished());
    assert.equal(toHex(ini.handshake_hash()), v.handshake_hash);
    assert.equal(toHex(res.handshake_hash()), v.handshake_hash);
    const ti = ini.into_transport();
    const tr = res.into_transport();
    rest.forEach((m, i) => {
      const [from, to] = i % 2 === 0 ? [ti, tr] : [tr, ti];
      const c = from.encrypt(hex(m.payload));
      assert.equal(toHex(c), m.ciphertext);
      assert.equal(toHex(to.decrypt(c)), m.payload);
    });
  });
}

function handshake(position, { guestPsk, hostPsk } = {}) {
  const host = keypair();
  const guest = keypair();
  const psk = random(32);
  const ini = noise.Handshake.initiator(position, guest.priv, host.pub, guestPsk ?? psk, PROLOGUE);
  const res = noise.Handshake.responder(position, host.priv, hostPsk ?? psk, PROLOGUE);
  return { host, guest, ini, res };
}

for (const position of [1, 2]) {
  test(`IKpsk${position}: round trip with fresh keys`, () => {
    const { guest, ini, res } = handshake(position);
    res.read_message(ini.write_message(new Uint8Array(0)));
    ini.read_message(res.write_message(new Uint8Array(0)));
    assert.deepEqual(res.remote_static(), guest.pub, 'host learns the guest key');
    assert.deepEqual(ini.handshake_hash(), res.handshake_hash());
    const g = ini.into_transport();
    const h = res.into_transport();
    assert.equal(new TextDecoder().decode(h.decrypt(g.encrypt(text('hello host')))), 'hello host');
    assert.equal(new TextDecoder().decode(g.decrypt(h.encrypt(text('hello guest')))), 'hello guest');
  });

  function channel() {
    const { ini, res } = handshake(position);
    res.read_message(ini.write_message(new Uint8Array(0)));
    ini.read_message(res.write_message(new Uint8Array(0)));
    return { g: ini.into_transport(), h: res.into_transport() };
  }

  test(`IKpsk${position}: transport rejects tampering, replay and reordering`, () => {
    const t1 = channel();
    const bad = t1.g.encrypt(text('first'));
    bad[0] ^= 1;
    assert.throws(() => t1.h.decrypt(bad), 'tampered');
    bad[0] ^= 1;
    assert.equal(new TextDecoder().decode(t1.h.decrypt(bad)), 'first', 'a failure does not move the counter');

    const t2 = channel();
    const first = t2.g.encrypt(text('first'));
    t2.h.decrypt(first);
    assert.throws(() => t2.h.decrypt(first), 'replayed');

    const t3 = channel();
    t3.g.encrypt(text('first'));
    assert.throws(() => t3.h.decrypt(t3.g.encrypt(text('second'))), 'out of order');
  });

  test(`IKpsk${position}: a wrong host key fails`, () => {
    const guest = keypair();
    const host = keypair();
    const impostor = keypair();
    const psk = random(32);
    const ini = noise.Handshake.initiator(position, guest.priv, host.pub, psk, PROLOGUE);
    const res = noise.Handshake.responder(position, impostor.priv, psk, PROLOGUE);
    assert.throws(() => res.read_message(ini.write_message(new Uint8Array(0))));
  });

  test(`IKpsk${position}: limits`, () => {
    const { ini } = handshake(position);
    assert.throws(() => ini.into_transport(), 'not finished');
    assert.throws(() => noise.Handshake.initiator(position, random(32), random(32), random(31), PROLOGUE));
  });
}

test('position 3 is refused', () => {
  assert.throws(() => noise.protocol_name(3));
});

test('IKpsk1: the host rejects a wrong passphrase at the first message', () => {
  const { ini, res } = handshake(1, { guestPsk: random(32), hostPsk: random(32) });
  assert.throws(() => res.read_message(ini.write_message(new Uint8Array(0))));
});

test('IKpsk2: the host cannot tell a wrong passphrase and answers anyway', () => {
  const { ini, res } = handshake(2, { guestPsk: random(32), hostPsk: random(32) });
  res.read_message(ini.write_message(new Uint8Array(0)));
  const m2 = res.write_message(new Uint8Array(0));
  assert.throws(() => ini.read_message(m2), 'only the guest notices');
});

// Someone who has the link (so the host's public key) but not the passphrase
// opens one connection, then tests passphrase guesses offline.
function offlineGuessing(position) {
  const host = keypair();
  const psks = Array.from({ length: 20 }, () => random(32)); // stand-ins for PBKDF2(guess)
  const real = psks[13];
  const attacker = keypair();
  const eph = keypair().priv; // the attacker controls its own randomness
  const res = noise.Handshake.responder(position, host.priv, real, PROLOGUE);
  const first = vec.Handshake.initiator_for_vectors(position, attacker.priv, host.pub, psks[0], PROLOGUE, eph);
  let reply;
  try {
    res.read_message(first.write_message(new Uint8Array(0)));
    reply = res.write_message(new Uint8Array(0));
  } catch {
    return { answered: false };
  }
  const found = psks.findIndex((guess) => {
    const hs = vec.Handshake.initiator_for_vectors(position, attacker.priv, host.pub, guess, PROLOGUE, eph);
    hs.write_message(new Uint8Array(0));
    try { hs.read_message(reply); return true; } catch { return false; }
  });
  return { answered: true, found };
}

test('IKpsk2: one connection lets someone with the link test guesses offline', () => {
  assert.deepEqual(offlineGuessing(2), { answered: true, found: 13 });
});

test('IKpsk1: a wrong guess gets no answer, so guessing stays online', () => {
  assert.deepEqual(offlineGuessing(1), { answered: false });
});
