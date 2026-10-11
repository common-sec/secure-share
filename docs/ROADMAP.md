# Roadmap

The roadmap is the list of things we work on. **Exactly one item is in progress at a time.** Each
item is one feature and gets its own version. Ideas start in [IDEAS.md](IDEAS.md) and only move
here once chosen.

## How it works

1. **Idea → roadmap.** An idea in [IDEAS.md](IDEAS.md) is accepted, given a version and added below as *Planned*.
2. **One in progress.** The top *Planned* item becomes *In progress* only when the previous one is *Done*.
3. **Iteration = commit.** Every iteration ends with a commit whose message says what changed and
   why. Tests must pass locally and in CI before an item is marked *Done*.
4. **Release.** When an item is done: update [CHANGELOG.md](../CHANGELOG.md), mark it *Done*, and tag `vX.Y.Z`.

## Versioning

[Semantic versioning](https://semver.org/):

| Change | Before 1.0 | From 1.0 |
|---|---|---|
| A roadmap feature | minor (`0.X.0`) | minor (`X.Y.0`) |
| Fixes, docs, refactors with no visible change | patch (`0.X.Y`) | patch |
| Incompatible change to the link format or protocol (old links/peers stop working) | minor, noted as breaking | **major** |

`1.0.0` is the first public release.

## Items

| Version | Feature | Status |
|---|---|---|
| 0.1.0 | **Baseline**: password/passphrase generator, Secure Chat, Secure Share, docs, browser test suite | ✅ Done |
| 0.2.0 | **Tests run anywhere**: one headless test command that works on a developer machine and in CI | 🔨 In progress |
| 0.3.0 | **No runtime CDN**: vendor Trystero into the repo, remove jsDelivr from the CSP | Planned |
| 0.4.0 | **Type checking**: JSDoc types for protocol messages and public APIs, `tsc --checkJs` in CI | Planned |
| 0.5.0 | **Support & feedback links**: GitHub star, donations, "+1" rating; short privacy note | Planned |
| 0.6.0 | **AI-assisted memorable passphrases** (on-device model, entropy kept by the CSPRNG) | Planned |
| 1.0.0 | **Public release**: license, production deployment with security headers, release checklist, external protocol review | Planned |

### 0.2.0: Tests run anywhere 🔨

**Goal:** `python tests/run_headless.py` runs the whole suite headlessly on any machine with
Python, and CI runs the exact same command.
**Done when:** the command passes locally (Windows) and in CI (Linux) on Chromium and Firefox,
and docs/TESTING.md explains setup in one place.

### 0.3.0: No runtime CDN
**Goal:** the app runs with zero third-party JavaScript at runtime. Removes the largest residual
risk in the threat model (whoever serves the JS controls the app).
**Done when:** Trystero is bundled into `src/vendor/` with its version and checksum recorded, the
CSP is `script-src 'self'`, and CI verifies the checksum.

### 0.4.0: Type checking
**Goal:** catch mistakes in protocol message shapes before they ship, with no build step.
**Done when:** `src/lib/*.js` carries JSDoc types, `tsc --noEmit --checkJs` passes in CI, and the
protocol message types match docs/PROTOCOL.md.

### 0.5.0: Support & feedback links
**Goal:** let developers star the project, users donate or leave a rating, without any embedded
third-party script, image or cookie.
**Done when:** plain links (GitHub, Patreon / Buy Me a Coffee, a rating site) appear in the footer
and after a successful share, and a short "privacy by default" note explains what the app does
and doesn't collect.

### 0.6.0: AI-assisted memorable passphrases
**Goal:** an optional "make it a sentence" mode in which an on-device model turns CSPRNG-chosen
words and a number into a memorable phrase, before the usual random variation rules.
**Done when:** the design in [IDEAS.md](IDEAS.md#ai-assisted-memorable-passphrases) is
implemented, the output is validated to contain every chosen word, the shown strength counts only
CSPRNG choices, and it falls back cleanly when no on-device model is available.

### 1.0.0: Public release
**Goal:** ready to publish and be audited.
**Done when:** a license is chosen; the app is deployed on a static host with HSTS, CSP and
`nosniff` headers; there's a release checklist including manual WebRTC tests across two networks;
and docs/PROTOCOL.md has been reviewed by someone outside the project.
