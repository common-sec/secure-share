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
| 0.2.0 | **Tests run anywhere**: one headless test command that works on a developer machine and in CI | ✅ Done |
| 0.3.0 | **Sandboxed development environment**: all dev, tests and scans in pinned, hardened containers; npm/pip/Dependabot supply-chain rules | ✅ Done |
| 0.3.1 | **Dev environment refinements**: TruffleHog for secrets, a pinned test image, unit tests in `tests/unit/`, project rules as Semgrep rules, preview via compose | Next |
| 0.4.0 | **End-to-end tests**: real UI flows across several browsers over real WebRTC, with Playwright | Planned |
| 0.5.0 | **Reproducible TypeScript build**: pinned, locked dependencies bundled at build time, no runtime CDN | Planned |
| 0.6.0 | **DAST and fuzzing**: dynamic scanning of the served app, plus fuzzing of host and client (protocol and UI inputs) | Planned |
| 0.7.0 | **OpenSSF Scorecard**: publish the repository and clear the Scorecard checks | Planned |
| 0.8.0 | **Support & feedback links**: GitHub star, donations, "+1" rating; short privacy note | Planned |
| 0.9.0 | **AI-assisted memorable passphrases** (on-device model, entropy kept by the CSPRNG) | Planned |
| 1.0.0 | **Public release**: license, production deployment with security headers, release checklist, external protocol review | Planned |

### 0.2.0: Tests run anywhere ✅

**Goal:** `python tests/run_headless.py` runs the whole suite headlessly on any machine with
Python, and CI runs the exact same command.
**Done when:** the command passes locally (Windows) and in CI (Linux) on Chromium and Firefox,
and docs/TESTING.md explains setup in one place.

### 0.3.0: Sandboxed development environment ✅
**Goal:** nothing runs on the host but a container engine: development, tests and security scans
all run in pinned, non-root, hardened containers, so a compromised dependency can't reach the rest
of the machine.
**Done when:** `docker compose` runs the app, the browser tests (no network) and each scanner
(Semgrep, Trivy, Gitleaks, project checks); every image, action and package is pinned (digest,
SHA or hash); `.npmrc` and `pip.conf` enforce no install scripts and a 7-day minimum age, matched
by the Dependabot cooldown; CI runs the same containers; docs/DEVELOPMENT.md explains it all.

### 0.3.1: Dev environment refinements
**Goal:** tidy up the 0.3.0 tooling based on review.
**Done when:**
- secret scanning uses **TruffleHog** (working tree and full git history, no outbound
  verification calls) instead of Gitleaks;
- the Playwright test image is **built from the Dockerfile** (`test` target) with the hash-pinned
  Python packages baked in under `pip.conf` rules, replacing the `test-deps` install step;
- unit tests live in `tests/unit/` and run as the `test-unit` service (no network);
- the project rules in `scripts/static-checks.sh` become **custom Semgrep rules**, and the script
  and `checks` service are removed;
- the Claude Code preview (`.claude/launch.json`) starts the app through `docker compose up web`;
- docs/TESTING.md explains how Playwright runs both the unit tests (inside the browser, where Web
  Crypto, WebRTC and IndexedDB live) and the end-to-end tests.

### 0.4.0: End-to-end tests
**Goal:** test what users actually do, through the real UI, in real browsers, over real WebRTC.
**Done when:**
- a `test-e2e` service (Playwright, **with network**) drives several isolated browser contexts
  as host and guests: create a chat room, join with the passphrase, approve, exchange messages and
  files, remove a member; and a Secure Share delivery, including the one-time link being dead
  afterwards;
- negative paths are covered: wrong passphrase, declined guest, locked room;
- discovery runs against a **local Nostr relay container** (pinned) on an isolated network for
  deterministic CI runs, plus an optional run against the public relays;
- it runs in CI and is documented in docs/TESTING.md.

### 0.5.0: Reproducible TypeScript build
**Goal:** move to TypeScript together with a build system, so that every dependency is
downloaded once at a pinned, locked version, bundled into the app at build time, and never fetched
from a third party at runtime. Anyone can rebuild a release and get byte-identical output, which is
how auditors check that the served files come from the reviewed source.
**Done when:**
- sources are TypeScript (strict), with protocol messages typed to match docs/PROTOCOL.md;
- dependencies (Trystero, the build tool) are pinned in `package.json`, with `package-lock.json`
  committed and installed with `npm ci`, and the lockfile's integrity hashes verified;
- the build bundles everything into `dist/` (CSP `script-src 'self'`, no CDN);
- building twice gives identical `dist/` checksums, CI checks this and publishes the checksums;
- the dev container builds the bundle and the `test` container tests it, locally and in CI;
- docs explain how to rebuild and verify a release.

### 0.6.0: DAST and fuzzing
**Goal:** attack the running app the way an outsider would, on both sides of a connection.
**Done when:**
- **DAST:** a pinned OWASP ZAP container scans the served app (baseline, plus an active scan
  against the local `web` service), covering headers, CSP, and injection through URL parameters
  and the fragment; it runs in CI with documented, reviewed exceptions;
- **protocol fuzzing, host and clients:** malformed, truncated, oversized, replayed and
  out-of-order handshake messages, control messages, envelopes and file payloads are fed to a
  host and to guests (via the fake transport, and in e2e via a malicious peer); none may crash,
  hang, leak data, admit an unapproved peer or render peer content as HTML;
- **UI and input fuzzing:** room links (`r`, `k`, `h`), nicknames, passphrases, message bodies
  and file names, on both host and client pages;
- a time-boxed fuzz run in CI, longer runs on demand, and every crash reproduced as a regression test.

### 0.7.0: OpenSSF Scorecard
**Goal:** a public repository that scores well on the [OpenSSF Scorecard](https://securityscorecards.dev),
as a visible, independent signal of supply-chain hygiene.
**Done when:**
- the repository is public on GitHub, with a license;
- the Scorecard GitHub Action (pinned by SHA) runs on a schedule and publishes results, with a
  badge in the README;
- each check is cleared or has a documented reason: Pinned-Dependencies, Token-Permissions,
  Dependency-Update-Tool, SAST, Fuzzing, Security-Policy, License, Branch-Protection,
  Code-Review, Signed-Releases (signed tags / release artifacts with provenance),
  CI-Tests, Vulnerabilities, Dangerous-Workflow, Binary-Artifacts, Maintained;
- the OpenSSF Best Practices badge is started.

### 0.8.0: Support & feedback links
**Goal:** let developers star the project, users donate or leave a rating, without any embedded
third-party script, image or cookie.
**Done when:** plain links (GitHub, Patreon / Buy Me a Coffee, a rating site) appear in the footer
and after a successful share, and a short "privacy by default" note explains what the app does
and doesn't collect.

### 0.9.0: AI-assisted memorable passphrases
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
