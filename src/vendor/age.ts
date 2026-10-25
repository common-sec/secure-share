// The single place the age encryption library comes in.
// age-encryption ("typage"): the TypeScript implementation of the age file format (BSD-3-Clause),
// by age's author, https://github.com/FiloSottile/typage. It brings the noble/scure crypto
// libraries (ChaCha20-Poly1305, X25519, ML-KEM, HPKE, bech32), and uses Web Crypto where it can.
// Installed from npm at exact, lockfile-pinned versions and bundled at build time, like Trystero.
// Loaded lazily so pages that never encrypt a file don't pay for it.
import type * as AgeModule from 'age-encryption';
import type { bech32 as Bech32 } from '@scure/base';

export interface Age {
  age: typeof AgeModule;
  bech32: typeof Bech32;
}

let loading: Promise<Age> | null = null;

export function loadAge(): Promise<Age> {
  loading ??= Promise.all([import('age-encryption'), import('@scure/base')])
    .then(([age, base]) => ({ age, bech32: base.bech32 }))
    .catch((e: unknown) => { loading = null; throw e; });
  return loading;
}
