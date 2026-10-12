// The single place the third-party P2P library comes in.
// Trystero: serverless WebRTC matchmaking (MIT), https://github.com/dmotz/trystero
// Installed from npm at an exact, lockfile-pinned version and bundled into app.js at build time:
// nothing is fetched from a CDN at run time. Loaded lazily so pages that don't need it (the
// password generator) don't pay for it, and so the unit tests can run without it.
import type * as TrysteroModule from 'trystero';

export type Trystero = typeof TrysteroModule;

export function loadTrystero(): Promise<Trystero> {
  return import('trystero');
}
