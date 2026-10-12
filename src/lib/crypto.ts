// All cryptography for chat/share rooms, using only the native Web Crypto API.
//
// Room link:  #/<tool>?r=<room id>&k=<link secret>&h=<host key fingerprint>
//   link secret  --HKDF-->  Trystero signaling password (encrypts offers on public relays)
//   link secret + PBKDF2(passphrase)  --HKDF-->  group key (AES-256-GCM, all payloads)
//                                     --HKDF-->  auth key  (HMAC, proves the passphrase to the host)
// The passphrase is never mixed into anything published on the relays, so it can only be
// guessed online, against the host, who rejects and counts every wrong attempt.
import { utf8, fromUtf8, bytesToB64url, b64urlToBytes } from './encoding.js';

const subtle = crypto.subtle;
const ECDSA: EcKeyImportParams = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN: EcdsaParams = { name: 'ECDSA', hash: 'SHA-256' };
const PBKDF2_ITERATIONS = 600_000;
const IV_LEN = 12;

type Bytes = Uint8Array<ArrayBuffer>;

/** A per-session ECDSA P-256 identity; the private key is non-extractable. */
export interface Identity {
  privateKey: CryptoKey;
  /** base64url raw public key */
  pub: string;
  /** base64url SHA-256 of the raw public key */
  fp: string;
  /** first 16 characters of fp */
  id: string;
}

export interface RoomKeys {
  signalingPassword: string;
  groupKey: CryptoKey;
  authKey: CryptoKey;
}

export const randomId = (bytes: number): string => bytesToB64url(crypto.getRandomValues(new Uint8Array(bytes)));
export const sha256 = async (bytes: BufferSource): Promise<Bytes> => new Uint8Array(await subtle.digest('SHA-256', bytes));

function concat(...parts: Bytes[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

export async function deriveRoomKeys(roomId: string, secret: string, passphrase: string): Promise<RoomKeys> {
  const linkSecret = b64urlToBytes(secret);
  if (linkSecret.length !== 32) throw new Error('Invalid room link');
  const hkdf = (salt: string, info: string): HkdfParams => ({ name: 'HKDF', hash: 'SHA-256', salt: utf8.encode(salt), info: utf8.encode(info) });

  const linkKey = await subtle.importKey('raw', linkSecret, 'HKDF', false, ['deriveBits']);
  const signaling = new Uint8Array(await subtle.deriveBits(hkdf(`uss/v2/${roomId}`, 'signaling'), linkKey, 256));

  const pwKey = await subtle.importKey('raw', utf8.encode(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const pw = new Uint8Array(await subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: utf8.encode(`uss/v2/${roomId}`), iterations: PBKDF2_ITERATIONS }, pwKey, 256));

  const base = await subtle.importKey('raw', concat(linkSecret, pw), 'HKDF', false, ['deriveKey']);
  const groupKey = await subtle.deriveKey(hkdf(`uss/v2/${roomId}`, 'group'), base,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const authKey = await subtle.deriveKey(hkdf(`uss/v2/${roomId}`, 'auth'), base,
    { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign', 'verify']);

  return { signalingPassword: bytesToB64url(signaling), groupKey, authKey };
}

// ---- identities (ECDSA P-256, fresh per session, private key non-extractable) ----
export async function newIdentity(): Promise<Identity> {
  const keys = await subtle.generateKey(ECDSA, false, ['sign', 'verify']);
  const pub = new Uint8Array(await subtle.exportKey('raw', keys.publicKey));
  const fp = bytesToB64url(await sha256(pub));
  return { privateKey: keys.privateKey, pub: bytesToB64url(pub), fp, id: fp.slice(0, 16) };
}

export async function fingerprint(pubB64: string): Promise<string> {
  return bytesToB64url(await sha256(b64urlToBytes(pubB64)));
}

export async function sign(identity: Identity, text: string): Promise<string> {
  return bytesToB64url(new Uint8Array(await subtle.sign(SIGN, identity.privateKey, utf8.encode(text))));
}

const verifyKeys = new Map<string, CryptoKey>();
export async function verify(pubB64: string, text: string, sigB64: string): Promise<boolean> {
  try {
    let key = verifyKeys.get(pubB64);
    if (!key) {
      key = await subtle.importKey('raw', b64urlToBytes(pubB64), ECDSA, false, ['verify']);
      verifyKeys.set(pubB64, key);
    }
    return await subtle.verify(SIGN, key, b64urlToBytes(sigB64), utf8.encode(text));
  } catch {
    return false;
  }
}

// ---- passphrase proof (HMAC challenge-response) ----
export async function proof(authKey: CryptoKey, ...fields: string[]): Promise<string> {
  return bytesToB64url(new Uint8Array(await subtle.sign('HMAC', authKey, utf8.encode(fields.join('|')))));
}

export async function checkProof(authKey: CryptoKey, proofB64: string, ...fields: string[]): Promise<boolean> {
  try {
    return await subtle.verify('HMAC', authKey, b64urlToBytes(proofB64), utf8.encode(fields.join('|')));
  } catch {
    return false;
  }
}

// ---- AES-256-GCM ----
export async function seal(key: CryptoKey, bytes: Bytes): Promise<Bytes> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  return concat(iv, ct);
}

export async function open(key: CryptoKey, sealed: Uint8Array | ArrayBuffer): Promise<Bytes> {
  // A view over a plain ArrayBuffer is used in place; anything else (e.g. shared memory) is copied.
  const bytes: Bytes = sealed instanceof ArrayBuffer ? new Uint8Array(sealed)
    : sealed.buffer instanceof ArrayBuffer ? new Uint8Array(sealed.buffer, sealed.byteOffset, sealed.byteLength)
    : new Uint8Array(sealed);
  if (bytes.length < IV_LEN + 16) throw new Error('Ciphertext too short');
  return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, IV_LEN) }, key, bytes.subarray(IV_LEN)));
}

export const sealJson = async (key: CryptoKey, obj: unknown): Promise<string> => bytesToB64url(await seal(key, utf8.encode(JSON.stringify(obj))));
/** Decrypts and parses; the result is untrusted peer data and must be validated by the caller. */
export const openJson = async (key: CryptoKey, str: string): Promise<unknown> => JSON.parse(fromUtf8.decode(await open(key, b64urlToBytes(str))));

/** The parts of an RTCPeerConnection that safetyCode reads. */
export interface SdpPair {
  localDescription?: { sdp?: string } | null;
  remoteDescription?: { sdp?: string } | null;
}

/**
 * 12-digit code derived from both ends' DTLS certificate fingerprints. Both peers compute the
 * same value; a man-in-the-middle would hold different certificates on each side.
 */
export async function safetyCode(pc: SdpPair | undefined): Promise<string | null> {
  const fp = (sdp: string | undefined): string | null => {
    const m = /a=fingerprint:(\S+) (\S+)/i.exec(sdp ?? '');
    return m ? `${m[1]!.toLowerCase()} ${m[2]!.toUpperCase()}` : null;
  };
  const a = fp(pc?.localDescription?.sdp);
  const b = fp(pc?.remoteDescription?.sdp);
  if (!a || !b) return null;
  const digest = await sha256(utf8.encode([a, b].sort().join('|')));
  let n = 0n;
  for (const byte of digest.subarray(0, 8)) n = (n << 8n) | BigInt(byte);
  return (n % 10n ** 12n).toString().padStart(12, '0').match(/.{3}/g)!.join(' ');
}
