// Relays that push back: a rate-limiting relay is paused with exponential backoff, one that blocks
// us is closed for good (Trystero's own Nostr strategy does the same; dmotz/trystero#192). The
// bookkeeping is tested on its own with a fake clock, then the strategy over fake relay sockets.
import { test, assert } from './harness.js';
import { loadSymbolon } from '../../build/modules/vendor/symbolon.js';
import * as H from '../../build/modules/lib/relay-health.js';
import { createSymbolonStrategy } from '../../build/modules/lib/symbolon-nostr.js';

const reply = (...msg) => H.parseReply(JSON.stringify(msg));
const clock = () => {
  let t = 1_000_000;
  return { now: () => t, advance: (ms) => { t += ms; } };
};

test('relay-health: reads OK, CLOSED and EOSE, and nothing else', () => {
  assert.deepEqual(reply('OK', 'id', false, 'rate-limited: slow down'), { type: 'OK', accepted: false, reason: 'rate-limited: slow down' });
  assert.deepEqual(reply('CLOSED', 'sub', 'blocked: no'), { type: 'CLOSED', subId: 'sub', reason: 'blocked: no' });
  assert.deepEqual(reply('EOSE', 'sub'), { type: 'EOSE', subId: 'sub' });
  assert.equal(reply('NOTICE', 'hello'), null);
  assert.equal(reply('OK', 'id', 'yes'), null);
  assert.equal(H.parseReply('not json'), null);
  assert.equal(H.parseReply('{"OK":1}'), null);
});

test('relay-health: a rate limit pauses the relay 60 s, doubling to 15 min, and clears after', () => {
  const c = clock();
  const h = new H.RelayHealth(c.now);
  const limited = reply('OK', 'id', false, 'rate-limited: slow down');
  assert.equal(h.backoffMs('r'), 0);
  assert.deepEqual(h.onReply('r', limited), {});
  assert.equal(h.backoffMs('r'), 60_000);
  for (const expected of [120_000, 240_000, 480_000, 900_000, 900_000]) {
    h.onReply('r', limited);
    assert.equal(h.backoffMs('r'), expected, 'doubles, capped');
  }
  assert.equal(h.backoffMs('other'), 0, 'per relay');
  // Accepted while still paused (sent before the limit): the pause stands.
  h.onReply('r', reply('OK', 'id', true, ''));
  assert.equal(h.backoffMs('r'), 900_000);
  c.advance(900_000);
  assert.equal(h.backoffMs('r'), 0, 'over once the time is up');
  h.onReply('r', reply('OK', 'id', true, ''));
  h.onReply('r', limited);
  assert.equal(h.backoffMs('r'), 60_000, 'an accepted event after the pause starts over');
});

test('relay-health: blocked, restricted, auth-required and pow retire the relay', () => {
  for (const reason of ['blocked: go away', 'restricted: members only', 'auth-required: sign in', 'pow: difficulty 30']) {
    for (const r of [reply('OK', 'id', false, reason), reply('CLOSED', 'sub', reason)]) {
      const h = new H.RelayHealth();
      assert.deepEqual(h.onReply('r', r), { retire: true }, reason);
      assert.ok(h.isRetired('r'));
      assert.deepEqual(h.onReply('r', r), {}, 'retired once');
      assert.deepEqual(h.onReply('r', reply('CLOSED', 'sub', 'error: x')), {}, 'nothing more for a retired relay');
    }
  }
  const h = new H.RelayHealth();
  h.onReply('r', reply('OK', 'id', false, 'invalid: bad signature'));
  h.onReply('r', reply('OK', 'id', false, 'duplicate: have it'));
  assert.ok(!h.isRetired('r') && h.backoffMs('r') === 0, 'other rejections change nothing');
});

test('relay-health: a closed subscription is requested again, backing off, never inside a pause', () => {
  const c = clock();
  const h = new H.RelayHealth(c.now);
  const closed = reply('CLOSED', 'sub', 'error: shutting down');
  assert.deepEqual(h.onReply('r', closed), { resubscribe: { subId: 'sub', inMs: 5_333 } });
  assert.equal(h.onReply('r', closed).resubscribe.inMs, 10_666);
  assert.equal(h.onReply('r', closed).resubscribe.inMs, 21_332);
  assert.equal(h.onReply('r', closed).resubscribe.inMs, 42_664);
  assert.equal(h.onReply('r', closed).resubscribe.inMs, 60_000, 'capped at 60 s');
  h.onReply('r', reply('EOSE', 'sub'));
  assert.equal(h.onReply('r', closed).resubscribe.inMs, 5_333, 'an EOSE starts over');
  const limited = h.onReply('r', reply('CLOSED', 'sub', 'rate-limited: too many REQs'));
  assert.equal(limited.resubscribe.inMs, 60_000, 'waits out the rate-limit pause');
});

// --- the strategy, over fake relay sockets ---

const sym = await loadSymbolon();

function fakeRelays() {
  const clients = new Map();
  const connect = (url, onMessage) => {
    const client = {
      url, sent: [], isClosed: false, socket: { readyState: 1 },
      send(data) { if (!this.isClosed) this.sent.push(data); },
      close() { this.isClosed = true; this.socket.readyState = 3; },
      /** what the relay says to us */
      say: (...msg) => onMessage(JSON.stringify(msg)),
    };
    client.ready = Promise.resolve(client);
    clients.set(url, client);
    return client;
  };
  return { clients, connect };
}

const URLS = ['wss://relay-a.test', 'wss://relay-b.test'];
const sent = (client, type) => client.sent.filter((m) => m.startsWith(`["${type}"`));
const settle = () => new Promise((r) => setTimeout(r, 200));

function join(trystero, roomId) {
  return trystero.joinRoom({
    appId: 'secure-share.test.v3',
    signaling: { context: `secure-share/test/v3/${roomId}`, secret: crypto.getRandomValues(new Uint8Array(32)) },
    relayConfig: { urls: URLS, manualReconnection: true, warnOnRelayFailure: false },
    rtcConfig: { iceServers: [] },
  }, roomId);
}

test('relay-health: the strategy closes a relay that blocks it and stops using it', async () => {
  const { clients, connect } = fakeRelays();
  const trystero = createSymbolonStrategy(sym, connect);
  const first = join(trystero, 'room-1');
  await settle();
  const [a, b] = URLS.map((u) => clients.get(u));
  assert.ok(sent(a, 'REQ').length > 0 && sent(b, 'REQ').length > 0, 'subscribed on both relays');
  const subId = JSON.parse(sent(b, 'REQ')[0])[1];
  b.say('CLOSED', subId, 'blocked: not welcome');
  assert.ok(b.isClosed, 'the blocking relay is closed');
  const before = { a: a.sent.length, b: b.sent.length };
  const second = join(trystero, 'room-2');
  await settle();
  assert.ok(a.sent.length > before.a, 'the other relay is still used');
  assert.equal(b.sent.length, before.b, 'nothing more goes to the blocking relay');
  await first.leave();
  await second.leave();
});

test('relay-health: the strategy sends nothing to a rate-limiting relay during its pause', async () => {
  const { clients, connect } = fakeRelays();
  const health = new H.RelayHealth();
  const trystero = createSymbolonStrategy(sym, connect, health);
  const first = join(trystero, 'room-1');
  await settle();
  const [a, b] = URLS.map((u) => clients.get(u));
  a.say('OK', '0'.repeat(64), false, 'rate-limited: slow down');
  assert.ok(health.backoffMs(a.url) > 59_000, 'paused about a minute');
  assert.ok(!a.isClosed, 'paused, not closed');
  const before = { a: a.sent.length, b: b.sent.length };
  const second = join(trystero, 'room-2');
  await settle();
  assert.equal(a.sent.length, before.a, 'no REQ and no EVENT to the paused relay');
  assert.ok(b.sent.length > before.b, 'the other relay is still used');
  await first.leave();
  await second.leave();
});
