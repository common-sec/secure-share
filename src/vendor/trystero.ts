// The single place the third-party P2P library comes in.
// Trystero: serverless WebRTC matchmaking (MIT), https://github.com/dmotz/trystero
// We use only its core, @trystero-p2p/core (WebRTC peers, data channels, actions, the handshake
// hook), installed from npm at an exact, lockfile-pinned version. Its discovery over Nostr relays
// is our own strategy on Symbolon (src/lib/symbolon-nostr.ts), not Trystero's. Both are bundled
// into app.js's chunks at build time: nothing is fetched from a CDN at run time. Loaded lazily so
// pages that don't need it (the password generator) don't pay for it, and so the unit tests can
// run without it.
import type { Trystero } from '../lib/symbolon-nostr.js';

export type { Trystero, SymbolonRoomConfig } from '../lib/symbolon-nostr.js';

export function loadTrystero(): Promise<Trystero> {
  return import('../lib/symbolon-nostr.js').then((m) => m.load());
}
