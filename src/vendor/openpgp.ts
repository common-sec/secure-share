// The single place the OpenPGP library comes in.
// openpgp.js: OpenPGP in JavaScript (LGPL-3.0-or-later), by Proton, https://github.com/openpgpjs/openpgpjs
// Audited by Cure53 (2019). Installed from npm at an exact, lockfile-pinned version and bundled at
// build time: nothing is fetched from a CDN at run time. Loaded lazily, only by the encrypted
// files page, which loads it as soon as it opens, so encrypting and decrypting then work offline.
import type { OpenPGPModule } from '../lib/files.js';

export function loadOpenPGP(): Promise<OpenPGPModule> {
  return import('openpgp');
}
