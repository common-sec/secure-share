// The single place Symbolon comes in: the Rust library, compiled to WebAssembly, that seals the
// WebRTC offers and answers published on Nostr relays and builds and signs those events
// (https://github.com/common-sec/symbolon, the same library and release gum0x/bringmeback uses).
//
// The binding is not on npm: build.mjs takes it from the Symbolon release pinned by SHA-256 in
// tools/symbolon/symbolon-web.sha256, bundles its JavaScript into the chunk that loads this module,
// and copies its .wasm file next to that chunk as __SYMBOLON_WASM__. Nothing is fetched from a
// CDN at run time. Loaded lazily, by src/lib/transport.ts, so pages without rooms don't pay for it.
import init from './symbolon/symbolon_wasm.js';
import * as symbolon from './symbolon/symbolon_wasm.js';

declare const __SYMBOLON_WASM__: string;

export type Symbolon = Omit<typeof symbolon, 'default'>;

let ready: Promise<Symbolon> | null = null;

export function loadSymbolon(): Promise<Symbolon> {
  ready ??= init({ module_or_path: new URL(__SYMBOLON_WASM__, import.meta.url) })
    .then(() => symbolon as Symbolon)
    .catch((err: unknown) => { ready = null; throw err; });
  return ready;
}

export type { GroupKeys, Signal, SignalBox, SignalKind, EventSigner } from './symbolon/symbolon_wasm.js';
