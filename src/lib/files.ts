// Encrypted files (roadmap 0.12.0): password encryption in OpenPGP, in the profile GnuPG 2.4
// reads, so the file also opens with gpg, Kleopatra or GPG Suite (decision D25). openpgp.js does
// the format and the cryptography; this module only chooses its settings, packages several files
// as a ZIP first (lib/zip.ts), and streams everything, so a large file is never held whole in
// memory. The library is passed in (vendor/openpgp.ts loads it), so the unit tests can give it the
// copy from node_modules.
import type * as OpenPGP from 'openpgp';
import { zipStream, type ZipEntry } from './zip.js';

export type OpenPGPModule = typeof OpenPGP;

/** The most the page accepts, in and out: Blob storage holds it on a computer (phones less). */
export const MAX_PACKAGE_BYTES = 2 * 1024 ** 3;
export const MAX_PACKAGE_LABEL = '2 GB';

/** What the file is called inside, and its download name. */
export const PACKAGE_NAME = 'files.zip';

/**
 * openpgp.js settings, for both directions:
 *   - SEIPD version 1 (AES-256 with the MDC), not RFC 9580's AEAD packets: GnuPG 2.4 can't read those;
 *   - no compression: GnuPG doesn't need it, and it would only slow large files down;
 *   - the iterated and salted S2K at its highest count (65,011,712 bytes of SHA-256), which GnuPG
 *     accepts, so each password guess costs as much as the format allows;
 *   - decryption streams (allowUnauthenticatedStream): the plaintext comes out before the MDC at
 *     the end is checked, so callers must not release any of it until the stream has ended
 *     without an error. collect() below is how they do that.
 */
function config(pgp: OpenPGPModule): OpenPGP.PartialConfig {
  return {
    aeadProtect: false,
    preferredSymmetricAlgorithm: pgp.enums.symmetric.aes256,
    preferredCompressionAlgorithm: pgp.enums.compression.uncompressed,
    s2kType: pgp.enums.s2k.iterated,
    s2kIterationCountByte: 255,
    allowUnauthenticatedStream: true,
  };
}

/** One file, or several (and folders) as one ZIP package, with the name it will have inside. */
export function packageFiles(entries: ZipEntry[]): { name: string; stream: ReadableStream<Uint8Array>; size: number } {
  if (!entries.length) throw new Error('Add at least one file.');
  if (entries.length === 1) {
    const [only] = entries as [ZipEntry];
    return { name: only.path.split('/').pop() || 'file', stream: only.file.stream(), size: only.file.size };
  }
  return { name: PACKAGE_NAME, stream: zipStream(entries), size: entries.reduce((n, e) => n + e.file.size, 0) };
}

/** Counts the bytes going through a stream, for a progress bar. */
export function counted(stream: ReadableStream<Uint8Array>, onBytes: (n: number) => void): ReadableStream<Uint8Array> {
  let n = 0;
  return stream.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) { n += chunk.length; onBytes(n); controller.enqueue(chunk); },
  }));
}

/** Encrypts a stream with a password. `name` is stored in the file, as gpg does. */
export async function encrypt(pgp: OpenPGPModule, input: ReadableStream<Uint8Array>, name: string, password: string): Promise<ReadableStream<Uint8Array>> {
  if (!password) throw new Error('Choose a password.');
  const message = await pgp.createMessage({ binary: input, filename: name, format: 'binary' });
  return await pgp.encrypt({ message, passwords: [password], format: 'binary', config: config(pgp) }) as ReadableStream<Uint8Array>;
}

/** Reasons a file doesn't open, in words for the page. */
export type DecryptError = 'password' | 'damaged' | 'not-openpgp' | 'public-key' | 'too-large';

export class FileDecryptError extends Error {
  constructor(readonly reason: DecryptError, cause?: unknown) {
    super(reason, { cause });
  }
}

/** openpgp.js's error messages, mapped to what the person can do about them. */
export function decryptErrorReason(e: unknown): DecryptError {
  if (e instanceof FileDecryptError) return e.reason;
  const msg = e instanceof Error ? e.message : String(e);
  if (/no symmetrically encrypted session key|public key/i.test(msg)) return 'public-key';
  if (/session key decryption failed|password|passphrase/i.test(msg)) return 'password';
  if (/modification detected|mdc|integrity|tag|checksum|crc|unexpected end|truncated|premature/i.test(msg)) return 'damaged';
  return 'not-openpgp';
}

/** The first bytes of an ASCII-armored message (`gpg -c --armor`, an .asc file). */
const ARMOR = '-----BEGIN PGP MESSAGE-----';

/**
 * Decrypts a password-encrypted OpenPGP file (binary or armored). The data is a stream: read it
 * with collect(), which fails on a damaged or modified file. Throws FileDecryptError.
 */
export async function decrypt(
  pgp: OpenPGPModule, file: Blob, password: string, onBytes: (n: number) => void = () => {},
): Promise<{ data: ReadableStream<Uint8Array>; name: string }> {
  if (file.size > MAX_PACKAGE_BYTES) throw new FileDecryptError('too-large');
  try {
    const head = new TextDecoder().decode(await file.slice(0, 256).arrayBuffer()).trimStart();
    const input = counted(file.stream(), onBytes);
    const message = head.startsWith(ARMOR)
      ? await pgp.readMessage({ armoredMessage: input.pipeThrough(new TextDecoderStream() as ReadableWritablePair<string, Uint8Array>), config: config(pgp) })
      : await pgp.readMessage({ binaryMessage: input, config: config(pgp) });
    if (!message.packets.filterByTag(pgp.enums.packet.symEncryptedSessionKey).length) {
      throw new FileDecryptError(message.packets.filterByTag(pgp.enums.packet.publicKeyEncryptedSessionKey).length ? 'public-key' : 'not-openpgp');
    }
    const result = await pgp.decrypt({ message, passwords: [password], format: 'binary', config: config(pgp) });
    return { data: result.data as ReadableStream<Uint8Array>, name: result.filename };
  } catch (e) {
    throw new FileDecryptError(decryptErrorReason(e), e);
  }
}

/** Keeps at most this much in JavaScript memory before handing it to the browser's Blob storage. */
const FOLD_BYTES = 16 * 1024 * 1024;

/**
 * Reads a whole stream into a Blob. Chunks are folded into a Blob every 16 MB, so the browser can
 * keep them in its Blob storage (on disk, for large ones) instead of JavaScript memory. Nothing is
 * returned unless the stream ends without an error, so a decrypted file whose integrity check fails
 * is never offered. Fails once more than `limit` bytes have come out.
 */
export async function collect(stream: ReadableStream<Uint8Array>, type = 'application/octet-stream', limit = MAX_PACKAGE_BYTES): Promise<Blob> {
  let blob = new Blob([], { type });
  let pending: Uint8Array[] = [];
  let pendingBytes = 0;
  let total = 0;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      throw new FileDecryptError('too-large');
    }
    pending.push(value);
    pendingBytes += value.length;
    if (pendingBytes >= FOLD_BYTES) {
      blob = new Blob([blob, ...pending as BlobPart[]], { type });
      pending = [];
      pendingBytes = 0;
    }
  }
  return new Blob([blob, ...pending as BlobPart[]], { type });
}

/** The name to save an encrypted file as: "report.pdf.gpg", "files.zip.gpg". */
export const encryptedName = (name: string): string => `${name}.gpg`;

/**
 * The name to save a decrypted file as: the one stored inside it, else the encrypted file's name
 * without .gpg/.pgp/.asc. Only the last path part, made safe for a file system.
 */
export function decryptedName(inside: string, outer: string): string {
  const base = (s: string) => s.replace(/\\/g, '/').split('/').pop() ?? '';
  const clean = (s: string) => s.replace(/[\u0000-\u001f:*?"<>|]/g, '_').replace(/^\.+/, '').trim().slice(0, 200);
  const named = clean(base(inside));
  if (named) return named;
  return clean(base(outer).replace(/\.(gpg|pgp|asc)$/i, '')) || 'decrypted-file';
}
