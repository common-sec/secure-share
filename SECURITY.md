# Security policy

## Reporting a vulnerability

Please **don't open a public issue** for security problems. Report them privately through
GitHub's "Report a vulnerability" (Security → Advisories) on this repository, or email the
maintainer. Include steps to reproduce and the impact you expect. You'll get an acknowledgement
within a few days, and credit in the release notes if you'd like.

## Scope

In scope:
- the protocol and its implementation (`src/lib/room.ts`, `src/lib/crypto.ts`), see [docs/PROTOCOL.md](docs/PROTOCOL.md);
- anything that breaks a property in [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md);
- XSS, CSP bypasses, or injection through peer-controlled data;
- weaknesses in password or passphrase generation (bias, overstated entropy).

Out of scope: the limitations already listed in the threat model (e.g. IP visibility to peers, a
malicious host editing the roster), denial of service by relays, and compromised devices or
browser extensions.

## For auditors

- Start with [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), then [docs/PROTOCOL.md](docs/PROTOCOL.md).
- All cryptographic primitives are Web Crypto, except on the discovery relays, where Symbolon
  (Rust compiled to WebAssembly) seals and signs what is published (decision D26). The code to
  review is the composition in `src/lib/crypto.ts`, `src/lib/room.ts` and `src/lib/relay-seal.ts`
  (strict TypeScript).
- `tests/unit/room.test.js` shows the intended security properties as executable tests. Adversarial
  peers are built with `tests/unit/fake-transport.js`.
- The runtime dependencies are `@trystero-p2p/core@0.26.0` and `qrcode-generator@2.0.4` (both MIT),
  Symbolon's web binding `v0.2.0` (from its GitHub release, checked against the SHA-256 in
  `tools/symbolon/symbolon-web.sha256`), and
  `openpgp@6.3.2` (LGPL-3.0-or-later) and `client-zip@2.5.1` (MIT), only on the encrypted files
  page, locked
  in `package-lock.json`, bundled at build time and imported only from `src/vendor/`. Builds are reproducible: see
  [docs/RELEASES.md](docs/RELEASES.md) to check that served files match the source.
