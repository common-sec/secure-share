// What the Symbolon strategy publishes on Nostr relays, with the real WebAssembly library: only
// holders of the link secret can find, read or forge it, and it can't be moved or replayed.
import { test, assert } from './harness.js';
import { loadSymbolon } from '../../build/modules/vendor/symbolon.js';
import * as R from '../../build/modules/lib/relay-seal.js';

const enc = new TextEncoder();
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
const sym = await loadSymbolon();
const keysFor = (secret, context = 'secure-share/test/v3/room') => new sym.GroupKeys(enc.encode(context), secret);
const secret = rand(32);
const signer = sym.EventSigner.generate();
const TOPIC = 'Trystero@secure-share.test.v3@room';
const MESSAGE = JSON.stringify({ peerId: 'peer-zyxwvu', offer: 'v=0 sdp-plaintext' });

/** As a relay hands an event to a subscriber. */
const delivered = (message, subId = 'sub') => JSON.stringify(['EVENT', subId, JSON.parse(message)[1]]);

test('relay-seal: a sealed event opens with the same room keys, and reveals nothing', () => {
  const now = R.unixNow();
  const message = R.sealEvent(signer, keysFor(secret), TOPIC, MESSAGE, now);
  const event = R.parseEvent(delivered(message), now);
  assert.ok(event, 'parses');
  assert.equal(event.subId, 'sub');
  assert.equal(R.openEvent(keysFor(secret), event), MESSAGE);
  assert.ok(!message.includes('zyxwvu') && !message.includes('plaintext') && !message.includes('Trystero'), 'no plaintext on the relay');
  const raw = JSON.parse(message)[1];
  assert.equal(raw.kind, 21059);
  assert.deepEqual(raw.tags.find((t) => t[0] === 't'), ['t', event.topicHex]);
  assert.ok(raw.tags.some((t) => t[0] === 'expiration'), 'NIP-40 expiration for relays that store it');
});

test('relay-seal: the event is a valid Nostr event (id = SHA-256 of its serialization)', async () => {
  const raw = JSON.parse(R.sealEvent(signer, keysFor(secret), TOPIC, MESSAGE))[1];
  const serialized = JSON.stringify([0, raw.pubkey, raw.created_at, raw.kind, raw.tags, raw.content]);
  const id = R.toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(serialized))));
  assert.equal(raw.id, id);
  assert.equal(raw.pubkey, signer.publicKey);
  assert.match(raw.sig, /^[0-9a-f]{128}$/);
});

test('relay-seal: topics depend on the link secret and the room, never just the room id', () => {
  const t = R.relayTopic(keysFor(secret), TOPIC).hex;
  assert.equal(R.relayTopic(keysFor(secret), TOPIC).hex, t, 'stable for the room');
  assert.notEqual(R.relayTopic(keysFor(rand(32)), TOPIC).hex, t, 'another secret, another topic');
  assert.notEqual(R.relayTopic(keysFor(secret, 'secure-share/test/v3/other'), TOPIC).hex, t, 'another room, another topic');
  assert.notEqual(R.relayTopic(keysFor(secret), TOPIC + 'x').hex, t, "Trystero's topics stay distinct");
});

test('relay-seal: another secret can neither read nor forge a message', () => {
  const now = R.unixNow();
  const theirs = R.parseEvent(delivered(R.sealEvent(signer, keysFor(rand(32)), TOPIC, MESSAGE, now)), now);
  assert.equal(R.openEvent(keysFor(secret), theirs), null);
});

test('relay-seal: a message moved to another topic, re-dated or altered does not open', () => {
  const now = R.unixNow();
  const keys = keysFor(secret);
  const event = R.parseEvent(delivered(R.sealEvent(signer, keys, TOPIC, MESSAGE, now)), now);
  const other = R.relayTopic(keys, 'Trystero@other').hex;
  assert.equal(R.openEvent(keys, { ...event, topicHex: other }), null, 'moved');
  assert.equal(R.openEvent(keys, { ...event, createdAt: event.createdAt + 1 }), null, 're-dated');
  const c = event.content;
  const flipped = c.slice(0, 10) + (c[10] === 'A' ? 'B' : 'A') + c.slice(11);
  assert.equal(R.openEvent(keys, { ...event, content: flipped }), null, 'altered');
});

test('relay-seal: stale, future, oversized and malformed relay messages are dropped', () => {
  const now = R.unixNow();
  const keys = keysFor(secret);
  const at = (t) => R.parseEvent(delivered(R.sealEvent(signer, keys, TOPIC, MESSAGE, t)), now);
  assert.ok(at(now - R.MAX_AGE_S), 'at the edge of the window');
  assert.equal(at(now - R.MAX_AGE_S - 1), null, 'too old: a replay');
  assert.equal(at(now + R.MAX_AGE_S + 1), null, 'from the future');
  assert.equal(R.parseEvent('x'.repeat(R.MAX_MESSAGE + 1), now), null);
  for (const bad of ['', 'not json', '["NOTICE","hi"]', '["EOSE","sub"]', '["EVENT","sub",{"kind":1}]', '["EVENT","sub",null]', '{}', 42]) {
    assert.equal(R.parseEvent(bad, now), null, `refused ${JSON.stringify(bad)}`);
  }
  const raw = JSON.parse(R.sealEvent(signer, keys, TOPIC, MESSAGE, now))[1];
  const without = { ...raw, tags: raw.tags.filter((t) => t[0] !== 't') };
  assert.equal(R.parseEvent(JSON.stringify(['EVENT', 'sub', without]), now), null, 'no topic tag');
});
