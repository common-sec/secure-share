// The single place the ZIP library comes in.
// client-zip: streaming ZIP writer (MIT), by David Junger, https://github.com/Touffy/client-zip
// Installed from npm at an exact, lockfile-pinned version and bundled at build time: nothing is
// fetched from a CDN at run time. Loaded lazily with openpgp.js, only by the encrypted files page,
// which uses it to package several files or a folder as one ZIP before encrypting them.
import type { MakeZip } from '../lib/files.js';

export async function loadZip(): Promise<MakeZip> {
  return (await import('client-zip')).makeZip;
}
