# Security policy

## Reporting a vulnerability

Please **don't open a public issue** for security problems. Report them privately through
GitHub's "Report a vulnerability" (Security → Advisories) on this repository, or email the
maintainer. Include steps to reproduce and the impact you expect. You'll get an acknowledgement
within a few days, and credit in the release notes if you'd like.

## Scope

In scope:
- the protocol and its implementation (`src/lib/room.js`, `src/lib/crypto.js`), see [docs/PROTOCOL.md](docs/PROTOCOL.md);
- anything that breaks a property in [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md);
- XSS, CSP bypasses, or injection through peer-controlled data;
- weaknesses in password or passphrase generation (bias, overstated entropy).

Out of scope: the limitations already listed in the threat model (e.g. IP visibility to peers, a
malicious host editing the roster), denial of service by relays, and compromised devices or
browser extensions.

## For auditors

- Start with [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), then [docs/PROTOCOL.md](docs/PROTOCOL.md).
- All cryptographic primitives are Web Crypto. The code to review is the composition in
  `src/lib/crypto.js` (about 120 lines) and `src/lib/room.js` (about 470 lines).
- `tests/room.test.js` shows the intended security properties as executable tests. Adversarial
  peers are built with `tests/fake-transport.js`.
- The only runtime dependency is `trystero@0.26.0` (MIT), loaded from `src/vendor/trystero.js`.
