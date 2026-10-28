// Protocol tests for SecureRoom over an in-memory transport, including malicious peers.
import { test, assert } from './harness.js';
import { FakeNetwork } from './fake-transport.js';
import { SecureRoom } from '../../build/modules/lib/room.js';
import * as C from '../../build/modules/lib/crypto.js';

const PASS = 'karrot-behind-stonish';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function once(room, type, ms = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no "${type}" event within ${ms} ms`)), ms);
    room.addEventListener(type, (e) => { clearTimeout(timer); resolve(e.detail); }, { once: true });
  });
}

function collect(room, type) {
  const items = [];
  room.addEventListener(type, (e) => items.push(e.detail));
  return items;
}

async function expectNo(room, type, ms = 1500) {
  let fired = null;
  const fn = (e) => { fired = e.detail; };
  room.addEventListener(type, fn);
  await sleep(ms);
  room.removeEventListener(type, fn);
  assert.equal(fired, null, `unexpected "${type}" event`);
}

const invite = (host) => ({ roomId: host.roomId, secret: host.secret, hostFp: host.hostFp });

async function hostRoom(net, opts = {}) {
  return SecureRoom.host({ app: 'test', passphrase: PASS, nick: 'Alice', transport: net.transport(), ...opts });
}

/** Joins a guest and, unless told otherwise, has the host accept them. */
async function joinGuest(net, host, nick, { passphrase = PASS, accept = true } = {}) {
  const request = once(host, 'request');
  const guest = await SecureRoom.join({ app: 'test', ...invite(host), passphrase, nick, transport: net.transport() });
  if (!accept) return guest;
  const { peerId } = await request;
  const accepted = once(guest, 'accepted');
  await host.accept(peerId);
  await accepted;
  return guest;
}

const cleanup = (...rooms) => rooms.forEach((r) => r?.leave());

// ---- joining ----
test('guest with the right passphrase is verified, approved and can chat both ways', async () => {
  const net = new FakeNetwork();
  const host = await hostRoom(net);
  const request = once(host, 'request');
  const guest = await SecureRoom.join({ app: 'test', ...invite(host), passphrase: PASS, nick: 'Bob', transport: net.transport() });
  const connected = once(guest, 'connected');
  const req = await request;
  assert.equal(req.nick, 'Bob');
  const { code } = await connected;
  assert.equal(code, req.code, 'safety codes match on both ends');

  const accepted = once(guest, 'accepted');
  await host.accept(req.peerId);
  await accepted;

  const atGuest = once(guest, 'message');
  await host.send({ t: 'text', body: 'hi Bob' });
  const m1 = await atGuest;
  assert.equal(m1.inner.body, 'hi Bob');
  assert.equal(m1.member.nick, 'Alice');
  assert.ok(m1.member.host);

  const atHost = once(host, 'message');
  await guest.send({ t: 'text', body: 'hi Alice' });
  const m2 = await atHost;
  assert.equal(m2.inner.body, 'hi Alice');
  assert.equal(m2.member.nick, 'Bob');
  cleanup(host, guest);
});

test('wrong passphrase is refused, and the host is told', async () => {
  const net = new FakeNetwork();
  const host = await hostRoom(net);
  const failed = once(host, 'auth-failed');
  const guest = await SecureRoom.join({ app: 'test', ...invite(host), passphrase: 'guess', nick: 'Mallory', transport: net.transport() });
  const denied = await once(guest, 'denied');
  assert.equal(denied.reason, 'passphrase');
  assert.equal((await failed).failures, 1);
  await expectNo(host, 'request', 500);
  cleanup(host, guest);
});

test('the room locks itself after 5 wrong passphrases', async () => {
  const net = new FakeNetwork();
  const host = await hostRoom(net);
  const locked = once(host, 'lock', 30000);
  const guests = [];
  for (let i = 0; i < 5; i++) {
    const g = await SecureRoom.join({ app: 'test', ...invite(host), passphrase: `guess-${i}`, nick: `M${i}`, transport: net.transport() });
    await once(g, 'denied');
    guests.push(g);
  }
  assert.ok((await locked).auto);
  const late = await SecureRoom.join({ app: 'test', ...invite(host), passphrase: PASS, nick: 'Bob', transport: net.transport() });
  // A locked host is also disconnected from discovery, so the guest can't even find it.
  await expectNo(late, 'connected', 1500);
  cleanup(host, late, ...guests);
}, { timeout: 60000 });

test('a declined guest is not admitted and is told why', async () => {
  const net = new FakeNetwork();
  const host = await hostRoom(net);
  const request = once(host, 'request');
  const guest = await SecureRoom.join({ app: 'test', ...invite(host), passphrase: PASS, nick: 'Eve', transport: net.transport() });
  const closed = once(guest, 'closed');
  await host.reject((await request).peerId);
  assert.equal((await closed).reason, 'rejected');
  assert.equal(host.members.size, 1);
  cleanup(host, guest);
});

test('pending guests receive nothing until approved', async () => {
  const net = new FakeNetwork();
  const host = await hostRoom(net);
  const bob = await joinGuest(net, host, 'Bob');
  const eve = await joinGuest(net, host, 'Eve', { accept: false });
  await once(eve, 'connected');
  await host.send({ t: 'text', body: 'members only' });
  await expectNo(eve, 'message', 800);
  cleanup(host, bob, eve);
});

test('nicknames must be unique (case-insensitive)', async () => {
  const net = new FakeNetwork();
  const host = await hostRoom(net);
  const bob = await joinGuest(net, host, 'Bob');
  const fake = await SecureRoom.join({ app: 'test', ...invite(host), passphrase: PASS, nick: 'bOB', transport: net.transport() });
  assert.equal((await once(fake, 'denied')).reason, 'nick-taken');
  cleanup(host, bob, fake);
});

// ---- host authenticity ----
test('someone with the link and passphrase but not the host key cannot pose as host', async () => {
  const net = new FakeNetwork();
  const real = await hostRoom(net);
  const link = invite(real);
  real.leave();
  // The impostor knows everything in the link and the passphrase, only not the host's private key.
  const impostor = await SecureRoom.host({
    app: 'test', transport: net.transport(), maxGuests: 7,
    restore: {
      roomId: link.roomId, secret: link.secret, nick: 'Alice', approved: [],
      identity: await C.newIdentity(),
      keys: await C.deriveRoomKeys(link.roomId, link.secret, PASS),
    },
  });
  const guest = await SecureRoom.join({ app: 'test', ...link, passphrase: PASS, nick: 'Bob', transport: net.transport() });
  await expectNo(guest, 'connected', 1500);
  await expectNo(impostor, 'request', 10);
  cleanup(impostor, guest);
});

// ---- star topology ----
test('guests never connect to each other; the host relays between them', async () => {
  const net = new FakeNetwork();
  const host = await hostRoom(net);
  const bob = await joinGuest(net, host, 'Bob');
  const carol = await joinGuest(net, host, 'Carol');
  assert.deepEqual(Object.keys(bob.room.getPeers()), [bob.hostPeerId]);
  assert.deepEqual(Object.keys(carol.room.getPeers()), [carol.hostPeerId]);

  const atCarol = once(carol, 'message');
  await bob.send({ t: 'text', body: 'via the host' });
  const m = await atCarol;
  assert.equal(m.inner.body, 'via the host');
  assert.equal(m.member.nick, 'Bob', 'sender identity survives relaying');
  cleanup(host, bob, carol);
});

// ---- message authenticity ----
test('a member cannot forge messages as another member', async () => {
  const net = new FakeNetwork();
  const host = await hostRoom(net);
  const bob = await joinGuest(net, host, 'Bob');
  const carol = await joinGuest(net, host, 'Carol');
  await sleep(200); // let the roster settle
  const atHost = collect(host, 'message');
  const atCarol = collect(carol, 'message');

  // Bob claims to be Carol, signing with his own key.
  const inner = { t: 'text', body: 'I am Carol', id: C.randomId(12), from: carol.identity.id, ts: Date.now() };
  const d = JSON.stringify(inner);
  const sealed = await C.sealJson(bob.keys.groupKey, { d, s: await C.sign(bob.identity, d) });
  await bob.msgAction.send(sealed, { target: [bob.hostPeerId] });

  // ...and Bob claims to be Carol while signing as himself is also rejected by the relay check.
  const inner2 = { ...inner, id: C.randomId(12), from: bob.identity.id };
  const d2 = JSON.stringify(inner2);
  const tampered = await C.sealJson(bob.keys.groupKey, { d: d2.replace('I am Carol', 'edited'), s: await C.sign(bob.identity, d2) });
  await bob.msgAction.send(tampered, { target: [bob.hostPeerId] });

  await sleep(800);
  assert.equal(atHost.length, 0, 'host dropped forged/tampered messages');
  assert.equal(atCarol.length, 0, 'nothing was relayed');
  cleanup(host, bob, carol);
});

test('replayed messages are shown only once', async () => {
  const net = new FakeNetwork();
  const host = await hostRoom(net);
  const bob = await joinGuest(net, host, 'Bob');
  const atHost = collect(host, 'message');
  const inner = { t: 'text', body: 'once', id: C.randomId(12), from: bob.identity.id, ts: Date.now() };
  const d = JSON.stringify(inner);
  const sealed = await C.sealJson(bob.keys.groupKey, { d, s: await C.sign(bob.identity, d) });
  for (let i = 0; i < 3; i++) await bob.msgAction.send(sealed, { target: [bob.hostPeerId] });
  await sleep(500);
  assert.equal(atHost.length, 1);
  cleanup(host, bob);
});

test('data encrypted under a different key is ignored', async () => {
  const net = new FakeNetwork();
  const host = await hostRoom(net);
  const bob = await joinGuest(net, host, 'Bob');
  const atHost = collect(host, 'message');
  const other = await C.deriveRoomKeys(host.roomId, host.secret, 'another-pass');
  const inner = { t: 'text', body: 'x', id: C.randomId(12), from: bob.identity.id, ts: Date.now() };
  const d = JSON.stringify(inner);
  await bob.msgAction.send(await C.sealJson(other.groupKey, { d, s: await C.sign(bob.identity, d) }), { target: [bob.hostPeerId] });
  await bob.msgAction.send('not even ciphertext', { target: [bob.hostPeerId] });
  await sleep(500);
  assert.equal(atHost.length, 0);
  cleanup(host, bob);
});

// ---- files ----
test('files arrive intact through the relay', async () => {
  const net = new FakeNetwork();
  const host = await hostRoom(net);
  const bob = await joinGuest(net, host, 'Bob');
  const carol = await joinGuest(net, host, 'Carol');
  const bytes = crypto.getRandomValues(new Uint8Array(50_000));
  const atCarol = once(carol, 'file');
  await bob.sendFile(new File([bytes], 'notes.bin'));
  const { inner, member, blob } = await atCarol;
  assert.equal(inner.name, 'notes.bin');
  assert.equal(member.nick, 'Bob');
  assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())].slice(0, 64), [...bytes].slice(0, 64));
  assert.equal(blob.size, bytes.length);
  cleanup(host, bob, carol);
});

test('a file whose content does not match its signed hash is dropped', async () => {
  const net = new FakeNetwork();
  const host = await hostRoom(net);
  const bob = await joinGuest(net, host, 'Bob');
  const files = collect(host, 'file');
  const real = new Uint8Array([1, 2, 3]);
  const fake = new Uint8Array([6, 6, 6]);
  const { bytesToB64url } = await import('../../build/modules/lib/encoding.js');
  const inner = { t: 'file', name: 'x', size: 3, type: '', sha256: bytesToB64url(await C.sha256(real)), id: C.randomId(12), from: bob.identity.id, ts: Date.now() };
  const d = JSON.stringify(inner);
  const m = await C.sealJson(bob.keys.groupKey, { d, s: await C.sign(bob.identity, d) });
  await bob.fileAction.send(await C.seal(bob.keys.groupKey, fake), { target: [bob.hostPeerId], metadata: { m } });
  await sleep(500);
  assert.equal(files.length, 0);
  cleanup(host, bob);
});

// ---- host controls ----
test('removing a member disconnects them and updates everyone\'s roster', async () => {
  const net = new FakeNetwork();
  const host = await hostRoom(net);
  const bob = await joinGuest(net, host, 'Bob');
  const carol = await joinGuest(net, host, 'Carol');
  await sleep(200);
  const closed = once(carol, 'closed');
  const roster = once(bob, 'roster');
  await host.kick(carol.identity.id);
  assert.equal((await closed).reason, 'kicked');
  const { members } = await roster;
  assert.deepEqual(members.map((m) => m.nick).sort(), ['Alice', 'Bob']);
  cleanup(host, bob, carol);
});

// ---- relay (discovery) usage ----
test('relays are dropped once nobody new needs to find the room', async () => {
  const net = new FakeNetwork();
  const host = await hostRoom(net);
  const bob = await joinGuest(net, host, 'Bob');
  const bobSocket = bob.transport.getRelaySockets()['wss://relay.test'];
  assert.equal(bobSocket.readyState, 3, 'an accepted guest closes its relay connections');
  assert.ok(bob.transport.paused);

  const hostSocket = host.transport.getRelaySockets()['wss://relay.test'];
  assert.equal(hostSocket.readyState, 1, 'an open room stays discoverable');
  host.setLocked(true);
  assert.equal(hostSocket.readyState, 3, 'a locked room disconnects from relays');
  host.setLocked(false);
  assert.equal(hostSocket.readyState, 1, 'unlocking reconnects');
  cleanup(host, bob);
});

test('a full room stops being discoverable', async () => {
  const net = new FakeNetwork();
  const host = await hostRoom(net, { maxGuests: 1 });
  const bob = await joinGuest(net, host, 'Bob');
  assert.equal(host.transport.getRelaySockets()['wss://relay.test'].readyState, 3);
  cleanup(host, bob);
});

test('guests wait for a reloading host and are re-admitted automatically', async () => {
  const net = new FakeNetwork();
  const host = await hostRoom(net);
  const bob = await joinGuest(net, host, 'Bob');
  const snapshot = host.snapshot();
  const lost = once(bob, 'host-lost');
  host.room.leave(); // simulate a page reload: no goodbye message
  await lost;
  assert.equal(bob.transport.getRelaySockets()['wss://relay.test'].readyState, 1, 'guest looks for the host again');

  const back = once(bob, 'accepted', 10000);
  const resumed = await SecureRoom.host({ app: 'test', restore: snapshot, transport: net.transport(), maxGuests: 7 });
  await back;
  const atBob = once(bob, 'message');
  await resumed.send({ t: 'text', body: 'back' });
  assert.equal((await atBob).inner.body, 'back');
  cleanup(resumed, bob);
});

// ---- restrictive networks ----
test('when a network blocks the direct connection, both sides are told', async () => {
  const net = new FakeNetwork();
  const host = await hostRoom(net);
  const atHost = once(host, 'direct-blocked');
  const bob = await SecureRoom.join({ app: 'test', ...invite(host), passphrase: PASS, nick: 'Bob', transport: net.transport({ directBlocked: true }) });
  const atBob = await once(bob, 'direct-blocked');
  assert.ok(atBob.peerId, 'the guest learns which peer it could not reach');
  assert.ok((await atHost).peerId, 'the host learns someone tried to join');
  assert.equal(bob.accepted, false);
  assert.equal(host.guests.size, 0);
  cleanup(host, bob);
});

test('relays that cannot be reached are reported, and only while the room needs them', async () => {
  const net = new FakeNetwork();
  const host = await hostRoom(net);
  const hostReports = collect(host, 'relays');
  const bob = await SecureRoom.join({ app: 'test', ...invite(host), passphrase: PASS, nick: 'Bob', transport: net.transport({ relaysBlocked: true }) });
  const t0 = Date.now();
  const report = await once(bob, 'relays', 20000);
  assert.equal(report.reachable, false);
  assert.ok(Date.now() - t0 >= 9000, 'relays get time to connect before they count as blocked');
  assert.equal(hostReports.length, 0, 'reachable relays are not reported');

  host.setLocked(true); // the host stops needing the relays: closing them is not a problem
  await sleep(6000);
  assert.equal(hostReports.length, 0);
  cleanup(host, bob);
}, { timeout: 45000 });

// ---- time limit ----
test('the room closes for everyone at its time limit, and guests learn when on joining', async () => {
  const net = new FakeNetwork();
  const host = await hostRoom(net, { lifetimeMs: 4000 });
  const bob = await joinGuest(net, host, 'Bob');
  assert.ok(Math.abs(bob.expiresAt - host.expiresAt) < 1000, 'guest knows the closing time');
  const [atHost, atBob] = [once(host, 'closed', 12000), once(bob, 'closed', 12000)];
  assert.equal((await atBob).reason, 'expired');
  assert.equal((await atHost).reason, 'expired');
  assert.equal(host.transport.getRelaySockets()['wss://relay.test'].readyState, 3, 'host stops looking for guests');
  cleanup(host, bob);
});

test('the time limit is capped, and a reload does not extend it', async () => {
  const net = new FakeNetwork();
  const host = await hostRoom(net, { lifetimeMs: 1e12 });
  assert.ok(host.expiresAt - Date.now() <= 24 * 60 * 60 * 1000);
  const snapshot = host.snapshot();
  host.room.leave();
  const resumed = await SecureRoom.host({ app: 'test', restore: snapshot, transport: net.transport(), maxGuests: 7, lifetimeMs: 1e12 });
  assert.equal(resumed.expiresAt, host.expiresAt);
  cleanup(host, resumed);
});

test('a guest waiting for a host that never comes back also stops at the time limit', async () => {
  const net = new FakeNetwork();
  const host = await hostRoom(net, { lifetimeMs: 4000 });
  const bob = await joinGuest(net, host, 'Bob');
  const lost = once(bob, 'host-lost');
  host.room.leave(); // the host's tab vanishes without a goodbye
  host.closed = true; // and its own timer with it
  await lost;
  assert.equal((await once(bob, 'closed', 12000)).reason, 'expired');
  cleanup(host, bob);
});
