// The three candidate formats behind one interface, so the browser benchmark and the Node
// interoperability tests run exactly the same code. Passphrase mode only (the mode all three share),
// plus public keys where the format has them.
import * as age from 'age-encryption';
import * as openpgp from 'openpgp';
import SevenZip from '7z-wasm';

export const ageFormat = {
  name: 'age',
  async encrypt(bytes, passphrase) {
    const e = new age.Encrypter();
    e.setPassphrase(passphrase);
    return e.encrypt(bytes);
  },
  async decrypt(bytes, passphrase) {
    const d = new age.Decrypter();
    d.addPassphrase(passphrase);
    return d.decrypt(bytes);
  },
  async encryptToKey(bytes, recipient) {
    const e = new age.Encrypter();
    e.addRecipient(recipient);
    return e.encrypt(bytes);
  },
  async decryptWithKey(bytes, identity) {
    const d = new age.Decrypter();
    d.addIdentity(identity);
    return d.decrypt(bytes);
  },
};

// Two OpenPGP profiles: what GnuPG 2.4 reads (SEIPDv1 + iterated-salted S2K, openpgp.js's default),
// and RFC 9580 (AEAD + Argon2), which GnuPG 2.4 doesn't implement.
const pgp = (name, config) => ({
  name,
  async encrypt(bytes, passphrase) {
    const message = await openpgp.createMessage({ binary: bytes });
    return openpgp.encrypt({ message, passwords: [passphrase], format: 'binary', config });
  },
  async decrypt(bytes, passphrase) {
    const message = await openpgp.readMessage({ binaryMessage: bytes });
    const { data } = await openpgp.decrypt({ message, passwords: [passphrase], format: 'binary', config });
    return data;
  },
  async encryptToKey(bytes, armoredPublicKey) {
    const message = await openpgp.createMessage({ binary: bytes });
    const encryptionKeys = await openpgp.readKey({ armoredKey: armoredPublicKey });
    return openpgp.encrypt({ message, encryptionKeys, format: 'binary', config });
  },
  async decryptWithKey(bytes, armoredPrivateKey) {
    const message = await openpgp.readMessage({ binaryMessage: bytes });
    const decryptionKeys = await openpgp.readPrivateKey({ armoredKey: armoredPrivateKey });
    const { data } = await openpgp.decrypt({ message, decryptionKeys, format: 'binary', config });
    return data;
  },
});
export const pgpGnupg = pgp('openpgp (gpg-compatible)', { aeadProtect: false });
export const pgpRfc9580 = pgp('openpgp (RFC 9580)', {
  aeadProtect: true,
  preferredAEADAlgorithm: openpgp.enums.aead.gcm, // GCM runs on Web Crypto; OCB is pure JS
  s2kType: openpgp.enums.s2k.argon2,
});

// 7-Zip compiled to WebAssembly runs its normal command line against an in-memory file system:
// the input, the archive and the output all live in WebAssembly memory. A fresh instance per call,
// as a long-lived one keeps its memory at its high-water mark.
let sevenZipOptions = {};
export const setSevenZipOptions = (opts) => { sevenZipOptions = opts; };
async function run7z(files, args) {
  const out = [];
  const sz = await SevenZip({ ...sevenZipOptions, print: (s) => out.push(s), printErr: (s) => out.push(s) });
  for (const [path, data] of Object.entries(files)) sz.FS.writeFile(path, data);
  try { sz.callMain(args); } catch (e) { if (e?.status) throw new Error(`7z exit ${e.status}: ${out.join('\n')}`); }
  return { sz, out };
}
export const sevenZip = {
  name: '7z',
  async encrypt(bytes, passphrase) {
    // -mhe=on also encrypts file names; -mx=0 stores without compression, for a fair speed test.
    const { sz, out } = await run7z({ '/in.bin': bytes }, ['a', '-t7z', '-mx=0', '-mhe=on', `-p${passphrase}`, '/out.7z', '/in.bin']);
    if (!out.some((l) => l.includes('Everything is Ok'))) throw new Error(out.join('\n'));
    return sz.FS.readFile('/out.7z');
  },
  async decrypt(bytes, passphrase) {
    const { sz, out } = await run7z({ '/in.7z': bytes }, ['x', `-p${passphrase}`, '-o/out', '-y', '/in.7z']);
    if (!out.some((l) => l.includes('Everything is Ok'))) throw new Error(out.join('\n'));
    const [name] = sz.FS.readdir('/out').filter((n) => n !== '.' && n !== '..');
    return sz.FS.readFile(`/out/${name}`);
  },
};

export const formats = [ageFormat, pgpGnupg, pgpRfc9580, sevenZip];
