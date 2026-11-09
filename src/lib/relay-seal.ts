// How a Trystero signalling message travels on a public Nostr relay, sealed by Symbolon. Kept apart
// from the strategy (src/lib/symbolon-nostr.ts) so the unit tests can check it with the real
// WebAssembly library and no network or Trystero.
//
//   topic    = GroupKeys.topic(UTF-8(Trystero's topic name))       32 bytes, keyed by the link secret
//   aad      = "secure-share/relay/v1|" + hex(topic) + "|" + created_at
//   content  = b64u(GroupKeys.seal(UTF-8(message), aad))           XChaCha20-Poly1305
//   event    = EventSigner.signalEvent(created_at, topic, content) kind 21059, tags [t, hex(topic)]
//                                                                  and a NIP-40 expiration
// A receiver drops anything that isn't such an event, was made more than MAX_AGE_S from its own
// clock, or doesn't open with its room's keys under the event's own topic and time.
import type { EventSigner, GroupKeys } from '../vendor/symbolon.js';
import { b64urlToBytes, bytesToB64url, fromUtf8, utf8 } from './encoding.js';

/** Symbolon's event kind: ephemeral, so relays pass it on without storing it. */
export const KIND = 21059;
/** Messages further than this from this device's clock are dropped (Symbolon's signal window). */
export const MAX_AGE_S = 120;
/** Bigger relay messages are dropped before they're parsed. Symbolon seals at most 16 KiB. */
export const MAX_MESSAGE = 64 * 1024;
const AAD = 'secure-share/relay/v1';

export const toHex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
export const unixNow = (): number => Math.floor(Date.now() / 1000);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

const aadFor = (topicHex: string, createdAt: number) => utf8.encode(`${AAD}|${topicHex}|${createdAt}`);

/** The relay topic for one of Trystero's topic names: only holders of the link secret can compute it. */
export function relayTopic(keys: GroupKeys, topic: string): { bytes: Uint8Array; hex: string } {
  const bytes = keys.topic(utf8.encode(topic));
  return { bytes, hex: toHex(bytes) };
}

/** The relay message (["EVENT", event]) that publishes `message` on `topic`. */
export function sealEvent(signer: EventSigner, keys: GroupKeys, topic: string, message: string, createdAt = unixNow()): string {
  const { bytes, hex } = relayTopic(keys, topic);
  const content = bytesToB64url(keys.seal(utf8.encode(message), aadFor(hex, createdAt)));
  return `["EVENT",${signer.signalEvent(createdAt, bytes, content)}]`;
}

export interface RelayEvent { subId: string; id: string; topicHex: string; createdAt: number; content: string }

/** Reads ["EVENT", subId, event] from a relay; anything else, or a stale event, is null. */
export function parseEvent(data: unknown, now = unixNow()): RelayEvent | null {
  if (typeof data !== 'string' || data.length > MAX_MESSAGE) return null;
  let msg: unknown;
  try { msg = JSON.parse(data); } catch { return null; }
  // Notices, EOSE, OK and CLOSED need nothing from us.
  if (!Array.isArray(msg) || msg.length !== 3 || msg[0] !== 'EVENT' || typeof msg[1] !== 'string') return null;
  const event: unknown = msg[2];
  if (!isObj(event) || event.kind !== KIND || typeof event.id !== 'string' || typeof event.content !== 'string'
    || !Number.isSafeInteger(event.created_at) || !Array.isArray(event.tags)) return null;
  const createdAt = event.created_at as number;
  if (Math.abs(now - createdAt) > MAX_AGE_S) return null;
  const tag: unknown = event.tags.find((t: unknown) => Array.isArray(t) && t[0] === 't');
  if (!Array.isArray(tag) || typeof tag[1] !== 'string' || !/^[0-9a-f]{64}$/.test(tag[1])) return null;
  return { subId: msg[1], id: event.id, topicHex: tag[1], createdAt, content: event.content };
}

/** The message inside an event, or null unless it opens with `keys` under the event's topic and time. */
export function openEvent(keys: GroupKeys, event: RelayEvent): string | null {
  try {
    return fromUtf8.decode(keys.open(b64urlToBytes(event.content), aadFor(event.topicHex, event.createdAt)));
  } catch {
    return null;
  }
}
