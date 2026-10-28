# File format spike for encrypted files (2026-10-28)

For roadmap [0.12.0 Encrypted files](../ROADMAP.md#0120-encrypted-files). The question, from
[review on #35](https://github.com/common-sec/secure-share/pull/35): which existing, reviewed format
should the browser tool write, judged on **audits, crypto quality, performance, size limits,
opening the file offline with other tools, and ease of use**? Code and how to re-run it:
[prototypes/file-formats](../../prototypes/file-formats/).

**Recommendation: OpenPGP with `openpgp.js`, in the profile GnuPG reads.** It's the only candidate
that has been audited *and* opens with common tools on every OS, it streams large files, and its
speed is on par with the others. `age` has the cleanest crypto but only command-line tools open it.
7z is the handiest to open, but it fails on memory, size, maintenance and integrity.

## Candidates

| | Library (version tested) | Settings |
|---|---|---|
| **age** | `age-encryption` 0.3.1 (typage, by age's author) | passphrase: scrypt, log N = 18 (the default); keys: X25519 |
| **OpenPGP, gpg-compatible** | `openpgp` 6.3.2 (Proton) | SEIPDv1 (AES-256-CFB + MDC), iterated-salted S2K: the library's default |
| **OpenPGP, RFC 9580** | `openpgp` 6.3.2 | SEIPDv2 (AES-256-GCM via Web Crypto) + Argon2 |
| **7z** | `7z-wasm` 1.2.0 (7-Zip 24.09 compiled to WebAssembly) | AES-256, encrypted file names (`-mhe=on`), no compression |

Encrypted ZIP was ruled out without testing (weak key derivation, file names in clear, and neither
Windows Explorer nor macOS Finder can open AES ZIPs).

## Interoperability (all pass)

`node --test interop.test.js`, with age 1.1.1, GnuPG 2.4.4 and 7-Zip 23.01 on Linux, 3 MiB of random data:

| Test | age | OpenPGP gpg-compatible | OpenPGP RFC 9580 | 7z |
|---|---|---|---|---|
| Library → CLI, passphrase | ✅ `age -d` | ✅ `gpg -d` | ❌ GnuPG 2.4 can't read it (`unknown version 6`) | ✅ `7z x` |
| CLI → library, passphrase | ✅ `age -p` | ✅ `gpg -c` | — | ✅ `7z a -p` |
| Library ↔ CLI, public keys | ✅ X25519 | ✅ ed25519/cv25519 | — | no public keys |
| Wrong passphrase refused | ✅ | ✅ | ✅ | ✅ |
| One flipped byte refused | ✅ (Poly1305) | ✅ (MDC) | ✅ (GCM) | ✅ but only by CRC32 |

Tools that open the result offline (from their documentation, not tested here):

- **OpenPGP:** GnuPG (every OS), Kleopatra / Gpg4win (Windows), GPG Suite (macOS), OpenKeychain (Android).
- **age:** the `age` and `rage` command-line tools; very few graphical apps.
- **7z:** 7-Zip and NanaZip (Windows), PeaZip, Keka (macOS), ZArchiver (Android). Windows 11 Explorer
  opens 7z archives, but I couldn't confirm it handles encrypted ones.

## Performance and memory (Chromium, 100 MB)

`node run-bench.mjs 100`, three runs in a fresh headless Chromium each time, medians, on a shared
4-core cloud container. Throughput leaves out key derivation, which runs once per file and is shown
separately. "Extra memory" is the renderer's peak RSS above what it used once the input existed.

| | Key derivation | Encrypt | Decrypt | Extra memory, whole file in memory | 300 MB in memory | Streaming encrypt (speed, memory) |
|---|---|---|---|---|---|---|
| age | **1.9 s** (1.7–2.7) | 24 MB/s | 44 MB/s | 585 MB | 1.3 GB | 49 MB/s, ~330–440 MB |
| OpenPGP gpg-compatible | 0.08 s | 25 MB/s | 32 MB/s | 833 MB | 2.4 GB | 37 MB/s, ~310–390 MB |
| OpenPGP RFC 9580 | 0.44 s | 32 MB/s | 95 MB/s | 918 MB | 2.2 GB | not measured |
| 7z | 0.44 s | 28 MB/s | 17 MB/s | 1,069 MB | **3.1 GB** | **can't stream** |

For comparison, the native tools on the same machine encrypt 100 MB in 0.25 s (age), 0.4 s (7z) and
1.5 s (gpg). The browser libraries are roughly 10 times slower, but at 20–50 MB/s a 100 MB file still
takes a few seconds. Runs varied by up to 2× on this shared machine, so **speed doesn't separate the
candidates**.

**Memory does.** With the whole file in memory, every candidate needs several times the file's
size, because input, output and working copies all coexist. 7z needs about 10×, because 7-Zip runs on
an in-memory file system inside WebAssembly. Streaming, which age and OpenPGP support, keeps memory
flat: 300 MB took no more than 100 MB did. So large files must stream, and only the viewer should
hold a whole file.

## Bundle size (minified, gzip -9, encrypt and decrypt only)

| | JavaScript | WebAssembly | Notes |
|---|---|---|---|
| age | 52 KB | — | includes the post-quantum code |
| OpenPGP | 129 KB | — | |
| 7z | 19 KB | **665 KB** (1.65 MB raw) | the CSP would need `'wasm-unsafe-eval'`; the module includes every 7-Zip format and unRAR |

The current app is about 60 KB gzipped. Since the tool gets its own static page in 0.11.0, its library
only loads there.

## Audits, crypto and maintenance

| | Audit | Crypto | Maintenance |
|---|---|---|---|
| age | None of typage that I know of; its noble building blocks were audited | Modern: ChaCha20-Poly1305 per 64 KiB chunk, scrypt; post-quantum hybrid keys | Active, by age's author |
| OpenPGP | [Cure53, 2019](https://proton.me/blog/openpgpjs-protonmail-security-audit) ([OTF](https://www.opentech.fund/security-safety-audits/openpgp/)) | gpg profile: older but sound (CFB + SHA-1 MDC), fast S2K (0.08 s); complex format with a history of pitfalls | Active, by Proton, used in Proton Mail |
| 7z | None public | AES-256-CBC, SHA-256 key stretching, **no MAC**: CRC32 catches accidents, not deliberate edits | Wrapper by one person, last release June 2025, 7-Zip 24.09 (upstream is newer) |

## Verdict per criterion

| Criterion | age | OpenPGP (gpg profile) | 7z |
|---|---|---|---|
| Audited / reviewed | ⚠️ partly | ✅ | ❌ |
| Crypto quality | ✅ best | ✅ adequate | ❌ unauthenticated |
| Performance | ✅ (scrypt ~2 s per file, more on phones) | ✅ | ✅ encrypt, ⚠️ decrypt |
| Size limits | ✅ streams | ✅ streams | ❌ ~10× memory, no streaming |
| Bundle size | ✅ 52 KB | ✅ 129 KB | ❌ 684 KB + CSP change |
| Opens offline with common tools | ⚠️ CLI only | ✅ GUI tools on every OS | ✅ best |
| Ease of use outside the browser | ❌ | ⚠️ the tools exist, but they're heavy | ✅ |

## Recommendation and what's left

Use **OpenPGP via `openpgp.js`, in the GnuPG-compatible profile**, for both passphrases and public
keys. Most people open the file with our own page, which stays the easy path. Kleopatra, GPG Suite or
`gpg` remain an offline fallback that doesn't depend on us. Record this as a decision when 0.12.0
starts.

Trade-offs to accept, or to settle when building:

- **No post-quantum public keys** in the GnuPG profile. Passphrase mode is symmetric, so it's already
  safe against quantum attacks. If post-quantum keys become a requirement, `age` is the fallback.
- **The S2K is fast** (0.08 s), which makes guessing cheaper than with scrypt. Speakable passphrases
  carry about 59 bits (G1), which keeps guessing impractical. Raising the iteration count to the
  maximum GnuPG accepts is still worth testing.
- **The RFC 9580 profile** (AEAD + Argon2) is the better crypto, but GnuPG 2.4 can't open it, which
  defeats the point. It's worth revisiting if GnuPG adds support.
- **Mobile:** measure on a real phone. Cap the in-memory viewer at a size the device can hold, and
  stream saves (the File System Access API in Chromium, a Blob elsewhere).
