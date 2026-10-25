# Noise handshake prototype (snow on WebAssembly)

A study for roadmap 0.9.0, not used by the app. It wraps the
[snow](https://github.com/mcginty/snow) Noise library (Rust, 0.10.0) for the browser with
wasm-bindgen and checks two questions: does it work in a browser under our Content-Security-Policy,
and which `IK` variant fits our threat model.

**Roles.** The guest is the initiator and knows the host's static X25519 public key from the link.
Both sides hold a 32-byte pre-shared key (PSK), which the app would derive from the link secret and
PBKDF2(passphrase). The prologue would carry the protocol version and room id.

## Findings

- **Use `IKpsk1`, not `IKpsk2`.** With `psk2` (WireGuard's choice, made for a random PSK) the PSK is
  mixed in only at the end of the host's reply, so the host answers anyone who has the link.
  That reply lets the caller test passphrase guesses offline, which [D9](../../docs/DECISIONS.md)
  rules out. With `psk1` the PSK is mixed into the guest's first message, so the host rejects a
  wrong passphrase before answering and each guess needs a new connection. The tests show both.
- **Use ChaCha20-Poly1305, not AES-GCM, inside WebAssembly.** WebAssembly has no AES instructions,
  so snow's AES-GCM ran at about 15–18 MB/s in headless Chromium here, against about 70–95 MB/s
  for ChaCha20-Poly1305 (Web Crypto's native AES-GCM: about 95–180 MB/s). One run each in this
  container; numbers will differ on real devices. Suite: `Noise_IKpsk1_25519_ChaChaPoly_SHA256`.
- **Size:** about 85 KB of WebAssembly plus 19 KB of glue, about 39 KB gzipped together.
- **CSP:** the app's current policy blocks it (`Refused to compile or instantiate WebAssembly
  module`). Adding `'wasm-unsafe-eval'` to `script-src` is enough; it allows WebAssembly only,
  not JavaScript `eval`.
- **Keys** live in WebAssembly memory, not in non-extractable Web Crypto keys.
- **snow is not audited** (its README says so). It is widely used, and it passes the independent
  cacophony test vectors here.
- **snow 0.10 build quirks:** its `std` feature also turns on `ring`, which does not build for
  `wasm32-unknown-unknown` here, so this crate uses `default-features = false`. AES-GCM alone does
  not compile either (an import sits behind the ChaCha feature); not a problem with ChaChaPoly.
- **Transport:** each direction counts messages, so they must arrive in order and none may be
  lost; a lost or reordered message breaks the channel, which then has to be rebuilt. A rejected
  (tampered) message does not move the counter, so it can't be used to desynchronize the peers.

## Build and test

Needs Rust with the `wasm32-unknown-unknown` target, `wasm-bindgen-cli` 0.2.129 (same version as
the crate), Node, and Playwright with Chromium for the browser check.

```sh
./build.sh                               # pkg/ (app build) and pkg-vectors/ (adds fixed ephemerals)
node --test tests/handshake.test.mjs     # published vectors, failure cases, guessing oracle
node tests/browser.mjs                   # Chromium, current CSP vs. CSP with 'wasm-unsafe-eval'
```

`tests/vectors.json` holds the `IKpsk1` and `IKpsk2` ChaChaPoly/SHA256 vectors from cacophony (an
independent Haskell implementation), as shipped in snow's `tests/vectors/cacophony.txt`. The
fixed-ephemeral entry points exist only in the `test-vectors` build.
