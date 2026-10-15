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
5. **Small improvements** that don't need a feature of their own live in [TODO.md](TODO.md), by
   priority. They're done between roadmap items and released as patch versions.

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
| 0.3.1 | **Dev environment refinements**: TruffleHog for secrets, a built test image, unit tests in `tests/unit/`, preview via compose | ✅ Done |
| 0.4.0 | **First real-world test feedback**: Secure Share as the home page, clearer naming, stronger and masked room passphrases with a strength meter | ✅ Done |
| 0.5.0 | **End-to-end tests**: real UI flows across several browsers over real WebRTC, with Playwright | ✅ Done |
| 0.6.0 | **Reproducible TypeScript build**: pinned, locked dependencies bundled at build time, no runtime CDN | ✅ Done |
| 0.7.0 | **Safari and Edge coverage**: unit and end-to-end tests also on WebKit (Safari's engine, and every iOS browser), Edge where it differs from Chromium | Next |
| 0.8.0 | **Name, logo and organisation**: a distinctive app name, logo and favicon; move the repository to a dedicated GitHub organisation (an umbrella for several security tools) | Planned |
| 0.9.0 | **Share a generated password**: a button on the password generator opens a one-way Secure Share with it, passphrase and link ready | Planned |
| 0.10.0 | **SEO and launch readiness**: pre-rendered static pages, metadata and social previews, How it works and FAQ, sitemap, Search Console | Planned |
| 0.11.0 | **DAST and fuzzing**: dynamic scanning of the served app, plus fuzzing of host and client (protocol and UI inputs) | Planned |
| 0.12.0 | **OpenSSF Scorecard**: publish the repository and clear the Scorecard checks | Planned |
| 0.13.0 | **Security posture management**: track every security check and repository setting continuously, in one place | Planned |
| 0.14.0 | **Support & feedback links**: GitHub star, donations, "+1" rating; short privacy note | Planned |
| 0.15.0 | **AI-assisted memorable passphrases** (on-device model, entropy kept by the CSPRNG) | Planned |
| 0.16.0 | **Local version of the app** (architecture to define: PWA, Electron, Docker image, single file) | Planned |
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

### 0.3.1: Dev environment refinements ✅
**Goal:** tidy up the 0.3.0 tooling based on review.
**Done when:**
- secret scanning uses **TruffleHog** (working tree and full git history, no network, no
  outbound verification calls) instead of Gitleaks;
- the Playwright test image is **built from the Dockerfile** (`test` target) with the hash-pinned
  Python packages baked in under `pip.conf` rules, replacing the `test-deps` install step;
- unit tests live in `tests/unit/` and run as the `test-unit` service (no network);
- `scripts/static-checks.sh` and the `checks` service are removed: the repository hardening they
  re-checked is done, and ongoing tracking moves to posture management (0.13.0);
- the Claude Code preview (`.claude/launch.json`) starts the app through `docker compose up web`;
- docs/TESTING.md explains how Playwright runs both the unit tests (inside the browser, where Web
  Crypto, WebRTC and IndexedDB live) and the end-to-end tests.

### 0.4.0: First real-world test feedback ✅
**Context:** first test of the published site, an iPhone on 5G against a computer on wifi, with
both Secure Chat and Secure Share working across NAT.
**Done when:**
- **Secure Share is the home page**, with short guidance pointing to Secure Chat when several
  things need to be exchanged, or back and forth;
- the app has a clear name ("Secure Sharing"), and the page title changes with the selected tool;
- **room passphrases (Chat and Share) have no fixed pattern**: capitals, a number, a random
  separator, linking words at random positions, and not every word bent; the passphrase
  generator changes accordingly;
- passphrase fields show a **strength meter** (exact for generated passphrases, a conservative
  estimate for typed or edited ones);
- passphrases are **masked by default**, with a show/hide toggle, wherever they're entered or displayed.

### 0.5.0: End-to-end tests ✅
**Goal:** test what users actually do, through the real UI, in real browsers, over real WebRTC.
**Done when:**
- a `test-e2e` service (Playwright) drives several isolated browser contexts as host and guests,
  through the real UI, over real WebRTC: create a chat room, join with the passphrase, approve,
  exchange messages and files, remove a member; and a Secure Share delivery, including the
  one-time link being dead afterwards; including a Chromium ↔ Firefox pairing;
- negative paths are covered: wrong passphrase, declined guest, locked room;
- discovery runs against a **local Nostr relay** (a minimal one built into the test server, on the
  same origin so the app's CSP stays untouched) on a network with no internet, for deterministic
  CI runs; `test-e2e-public` runs the same scenarios against the real public relays and STUN;
- automated accessibility checks (axe-core) run on every page and state;
- it runs in CI and is documented in docs/TESTING.md.

### 0.6.0: Reproducible TypeScript build ✅
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
- docs explain how to rebuild and verify a release;
- the app shows its **build version** (release tag plus short commit) in the footer, matching
  the published checksums, so users and auditors can tell exactly which build they're running.

### 0.7.0: Safari and Edge coverage
**Goal:** the app is tested on the engines people actually use, notably iPhones: every iOS
browser runs on WebKit, Safari's engine.
**Done when:**
- the unit and end-to-end suites also run on **WebKit** (Playwright's WebKit build, already in the
  pinned test image), including cross-engine pairs such as a WebKit guest with a Chromium host;
- differences in WebRTC, Web Crypto, IndexedDB, Web Locks, downloads or the clipboard are fixed,
  or documented with a workaround;
- the release checklist includes a manual check on a **real iPhone with Safari** (Playwright's
  WebKit is close to Safari, but not identical);
- **Edge**: it uses Chromium's engine, so the Chromium runs cover it; a dedicated Edge run (amd64
  only in containers) is added only if a real difference shows up. A manual check on Edge for
  Windows goes in the release checklist.

### 0.8.0: Name, logo and organisation
**Why early:** the public address changes, so this must happen before anything is announced or
indexed. See [the UX/product/SEO review](reviews/2026-10-12-ux-product-seo.md#5-name-and-logo).
**Two separate names:**
- the **organisation**: an umbrella for several security tools and repositories (this app is
  the first), so its name must not be tied to sharing. *Not decided yet.*
- this **app**: its own product name (shortlist in the review).

**Progress (2026-10-14):** organisation **CommonSec** (`common-sec` on GitHub, domain
`common-sec.org`), app **CommonSec Share** (`common-sec/secure-share`), repository moved, site at
`common-sec.github.io/secure-share/`, names used across the app and docs (decision D21).
**2026-10-15:** served at `https://share.common-sec.org/` (custom domain, verified for the
organisation, HTTPS enforced). Still to do: logo, organisation rulesets and owners.

**Done when:**
- the organisation name and the app name are chosen, after a trademark and domain check;
- a logo exists for the app (and, if wanted, a mark for the organisation) as SVG plus favicon,
  `apple-touch-icon`, manifest icons and a 1200 × 630 social image;
- the repository lives in the organisation with 2FA required, organisation rulesets (protected
  default branch, required reviews, signed commits), and at least two owners or a documented
  recovery path;
- the site is served from the organisation's Pages: `https://<org>.github.io/<app>/` for this
  app, with `https://<org>.github.io/` as a small portal listing the organisation's tools; all
  links, docs and badges are updated;
- the app, README and docs use the new name consistently.

### 0.9.0: Share a generated password
**Goal:** generate a password and send it safely in one step.
**Done when:**
- each generated password has a **"Share securely"** button that opens Secure Share with the
  password as the text, a passphrase generated, and the one-time link ready to create;
- the password is handed over **in memory only**: never in the URL, history, storage or logs;
- covered by an end-to-end test (generate → share → receive the same password).

### 0.10.0: SEO and launch readiness
**Goal:** people searching for how to send a password or a sensitive file securely find the app,
and shared links show a trustworthy preview. See
[the review](reviews/2026-10-12-ux-product-seo.md#7-seo-and-discoverability).
**Done when:**
- every tool has a real, **pre-rendered static page** (`/`, `/chat/`, `/passwords/`) whose
  content is in the HTML without JavaScript, plus `/how-it-works/` and `/faq/`; room secrets stay
  in the URL fragment;
- each page has a keyword-led title, meta description, canonical URL, Open Graph and Twitter card
  tags, and the social image; `WebApplication` and `FAQPage` structured data;
- `robots.txt`, `sitemap.xml`, favicon set, web manifest and `theme-color`;
- the site is verified in Google Search Console and Bing Webmaster Tools (search impressions
  without any tracking script);
- Lighthouse CI (pinned container) runs in CI with budgets for SEO, accessibility and performance;
- a launch checklist lists the channels (Show HN, Reddit, Product Hunt, AlternativeTo, privacy
  tool directories) and what each requires.

### 0.11.0: DAST and fuzzing
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

### 0.12.0: OpenSSF Scorecard
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

### 0.13.0: Security posture management
**Goal:** know at any time which security checks run, which pass, and which repository settings
protect the project, without re-checking hardening by hand on every commit.
**Done when:**
- the tools are evaluated and chosen, preferring existing checks over custom rules:
  - OpenSSF Scorecard and Allstar (repository policy enforcement);
  - zizmor and actionlint (GitHub Actions security);
  - Checkov or Trivy config (Dockerfile, compose, workflows);
  - OSV-Scanner (dependencies, alongside Trivy);
  - legitify (GitHub repository and organisation settings);
  - custom Semgrep rules, only for what nothing else covers;
- scanner results (Semgrep, Trivy, TruffleHog, …) are uploaded as SARIF to GitHub code scanning,
  so findings are tracked, triaged and visible in one place;
- GitHub's built-in protections are enabled and documented: secret scanning with push
  protection, Dependabot alerts, private vulnerability reporting, branch rulesets;
- a scheduled workflow re-runs the posture checks, and docs/SECURITY_POSTURE.md lists each control,
  the tool that checks it, and its status;
- pre-commit automation is decided (see [IDEAS.md](IDEAS.md#pre-commit-checks)).

### 0.14.0: Support & feedback links
**Goal:** let developers star the project, users donate or leave a rating, without any embedded
third-party script, image or cookie.
**Done when:** plain links (GitHub, Patreon / Buy Me a Coffee, a rating site) appear in the footer
and after a successful share, and a short "privacy by default" note explains what the app does
and doesn't collect.

### 0.15.0: AI-assisted memorable passphrases
**Goal:** an optional "make it a sentence" mode in which an on-device model turns CSPRNG-chosen
words and a number into a memorable phrase, before the usual random variation rules.
**Done when:** the design in [IDEAS.md](IDEAS.md#ai-assisted-memorable-passphrases) is
implemented, the output is validated to contain every chosen word, the shown strength counts only
CSPRNG choices, and it falls back cleanly when no on-device model is available.

### 0.16.0: Local version of the app
**Goal:** the same app usable without trusting a website at run time: installed or run locally.
**Architecture to define**, comparing:
- **PWA**: installable from the site, works offline after the first visit. Still delivered by the
  website the first time and on updates.
- **Electron** (or a lighter shell such as Tauri): desktop app with signed releases. A bigger
  dependency and attack surface.
- **Docker image**: serve the app locally from a pinned, reproducible image.
- **Single self-contained HTML file**: download once, verify its checksum or signature, open
  from disk. Needs a check that Web Crypto, WebRTC and storage work from a local file.

**Done when:** the options are compared in docs, one or more are chosen and shipped, and releases
are reproducible and verifiable (checksums or signatures).

### 1.0.0: Public release
**Goal:** ready to publish and be audited.
**Done when:** a license is chosen; the app is deployed on a static host with HSTS, CSP and
`nosniff` headers; there's a release checklist including manual WebRTC tests across two networks;
and docs/PROTOCOL.md has been reviewed by someone outside the project.
