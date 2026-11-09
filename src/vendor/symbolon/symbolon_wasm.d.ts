// Types for Symbolon's JavaScript binding (the release ships it without them). Only what this app
// uses. symbolon_wasm.js itself is not in the repository: build.mjs takes it from the release pinned
// in tools/symbolon/symbolon-web.sha256. Byte strings are Uint8Arrays, and every failure throws.

export default function init(options?: { module_or_path?: URL | string | Request | Response | BufferSource | WebAssembly.Module }): Promise<unknown>;

/** Every key of a group, derived inside wasm memory from `secret` (≥ 32 uniformly random bytes). */
export class GroupKeys {
  constructor(context: Uint8Array, secret: Uint8Array);
  /** A relay topic for `label` that only group members can compute (32 bytes). */
  topic(label: Uint8Array): Uint8Array;
  /** XChaCha20-Poly1305 with the group's seal key; `aad` is authenticated, not encrypted. */
  seal(plaintext: Uint8Array, aad: Uint8Array): Uint8Array;
  /** Throws if `sealed` was altered or sealed with another key or `aad`. */
  open(sealed: Uint8Array, aad: Uint8Array): Uint8Array;
  free(): void;
}

/** A long-term X25519 device key. */
export class DeviceKey {
  static generate(): DeviceKey;
  readonly publicKey: Uint8Array;
  free(): void;
}

export type SignalKind = 'announce' | 'offer' | 'answer' | 'candidate' | 'bye';

export class Signal {
  /** `to` is 16 zero bytes for announce and bye, which go to everyone with an empty body. */
  constructor(kind: SignalKind, createdAt: number, from: Uint8Array, to: Uint8Array, device: Uint8Array, body: Uint8Array);
  readonly kind: SignalKind;
  readonly createdAt: number;
  readonly from: Uint8Array;
  readonly to: Uint8Array;
  readonly device: Uint8Array;
  readonly body: Uint8Array;
  free(): void;
}

/** Seals and opens a group's signalling messages as Nostr event content. */
export class SignalBox {
  constructor(group: GroupKeys);
  readonly topic: Uint8Array;
  seal(signal: Signal): string;
  /** Throws unless `content` is a well-formed signal of this group made within two minutes of `now` (Unix seconds). */
  open(content: string, now: number): Signal;
  free(): void;
}

/** Signs Nostr events with a throwaway key. */
export class EventSigner {
  static generate(): EventSigner;
  readonly publicKey: string;
  /** A signed event as JSON, to send as ["EVENT", event]. */
  signalEvent(createdAt: number, topic: Uint8Array, content: string): string;
  free(): void;
}

/** A random 16-byte session id. */
export function newSession(): Uint8Array;

/** The relay filter (JSON) for a topic's signalling events from `since` on. */
export function signalFilter(topic: Uint8Array, since: number): string;
