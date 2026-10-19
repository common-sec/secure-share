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
| 0.7.0 | **Names, organisation and domain**: CommonSec organisation, CommonSec Share app, served at `share.common-sec.org` | ✅ Done (to tag) |
| 0.8.0 | **GitHub hardening basics**: license, organisation 2FA and owners, rulesets, GitHub's built-in protections, workflow linters, Scorecard, findings in code scanning | Next |
| 0.9.0 | **Staging and tagged production**: a staging site that follows `master`; production deployed only from release tags | Planned |
| 0.10.0 | **Safari and Edge coverage**: unit and end-to-end tests also on WebKit (Safari's engine, and every iOS browser), Edge where it differs from Chromium | In progress |
| 0.11.0 | **Standard encryption format**: Share payloads in the audited `age` format instead of our own framing (breaking) | Planned |
| 0.12.0 | **Connectivity on restrictive networks**: users behind symmetric NAT or UDP-blocking firewalls can still connect, through an end-to-end encrypted relay fallback | Planned |
| 0.13.0 | **Static pages and SEO**: pre-rendered static pages, metadata and social previews, How it works and FAQ, sitemap, Search Console | Planned |
| 0.14.0 | **Pre-launch security review**: full protocol review by someone outside the project, and every security finding fixed | Planned |
| 1.0.0 | **Public launch**: production hosting and headers, release checklist, announcement | Planned |
| 1.1.0 | **DAST and fuzzing**: dynamic scanning of the served app, plus fuzzing of host and client (protocol and UI inputs) | Planned |
| 1.2.0 | **Security posture management**: every security check and repository setting tracked continuously, in one place; all Scorecard checks cleared | Planned |
| 1.3.0 | **Share a generated password**: a button on the password generator opens a one-way Secure Share with it, passphrase and link ready | Planned |
| 1.4.0 | **Local version of the app** (architecture to define: PWA, Electron, Docker image, single file) | Planned |
| 1.5.0 | **AI-assisted memorable passphrases** (on-device model, entropy kept by the CSPRNG) | Planned |
| — | **Logo and visual identity**: no version and no deadline (see below) | Unscheduled |

**Why this order (2026-10-15):** the site is already public at `share.common-sec.org`, so the
security basics come first: the repository and its settings (supply chain is the main threat in
[THREAT_MODEL.md](THREAT_MODEL.md#9-supply-chain-the-static-host-the-npm-packages-the-build)),
then a safe way to ship (staging, tagged production), then testing on the browsers people use,
then the one breaking protocol change, which is cheap before 1.0 and a major version after it.
Then the relay fallback, so people on restrictive networks can connect at launch, and the static
pages and SEO. The full security review comes **just before launch**, so it reviews
what actually ships. DAST and fuzzing add depth after launch; they aren't the main controls in the
threat model. The logo needs iterations with people and doesn't affect usability, so it isn't on
the critical path. The high-priority UX fixes in [TODO.md](TODO.md) go in as patches between
items, before launch.

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
  re-checked is done, and ongoing tracking moves to posture management (now 1.2.0, basics in 0.8.0);
- the Claude Code preview (`.claude/launch.json`) starts the app through `docker compose up web`;
- docs/TESTING.md explains how Playwright runs both the unit tests (inside the browser, where Web
  Crypto, WebRTC and IndexedDB live) and the end-to-end tests.

### 0.4.0: First real-world test feedback ✅
**Context:** first test of the published site, between two devices on different networks (mobile data and wifi), with
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

### 0.7.0: Names, organisation and domain ✅
**Why early:** the public address changes, so this had to happen before anything is announced or
indexed. See [the UX/product/SEO review](reviews/2026-10-12-ux-product-seo.md#5-name-and-logo).
**Done:**
- organisation **CommonSec** (`common-sec` on GitHub, domain `common-sec.org`), an umbrella for
  several security tools, and app **CommonSec Share** (`common-sec/secure-share`), chosen after a
  trademark and domain check (decision D21);
- the repository lives in the organisation, and the site is served at
  `https://share.common-sec.org/` (custom domain verified for the organisation, HTTPS enforced);
- the app, README and docs use the new names consistently.

Moved out on 2026-10-15: organisation 2FA, rulesets and owners go to 0.8.0; the logo has its own
unscheduled item at the end.

### 0.8.0: GitHub hardening basics
**Goal:** the repository and organisation that produce the site are protected, because whoever
can push to `master` or change a workflow controls what every user runs. Settings and existing,
pinned tools only; the continuous tracking of all of it comes in 1.2.0.
**Done when:**
- the repository has a **license** (chosen and recorded as a decision);
- the organisation requires **2FA**, has **at least two owners** or a documented recovery path;
- **rulesets** on `master`: no direct pushes or force pushes, pull requests with a required review,
  required CI checks, signed commits; tags `v*` protected;
- GitHub's built-in protections are on: **secret scanning with push protection**, Dependabot
  alerts, **private vulnerability reporting** (linked from SECURITY.md);
- workflows: least-privilege `permissions` everywhere (already the rule), checked by **zizmor**
  and **actionlint** in pinned containers in CI; a `CODEOWNERS` file for workflows, build and
  protocol code;
- existing scanners (Semgrep, Trivy, TruffleHog) upload **SARIF to GitHub code scanning**;
- the **OpenSSF Scorecard** action (pinned by SHA) runs on a schedule with a README badge; every
  failing check is either fixed or listed with a reason for 1.2.0;
- docs/DEVELOPMENT.md lists the settings, so they can be re-checked after any change.

### 0.9.0: Staging and tagged production
**Goal:** nothing reaches users without being tried on a real, public URL first, and what
production serves is always a tagged, reproducible release whose checksums are published.
**Why a separate repository:** GitHub Pages serves one site per repository, so staging can't be a
subdomain of this one.
**Done when:**
- **production** (`share.common-sec.org`) is deployed only from release tags, in the same workflow
  as the GitHub Release, so the served files match the published `SHA256SUMS`; pushes to `master`
  no longer deploy it;
- **staging** is a separate repository (e.g. `common-sec/secure-share-staging`) whose workflow
  checks out this public repository's `master`, builds it in the same pinned container and
  deploys it to its own Pages (e.g. `staging.share.common-sec.org`). It **pulls** the source, so
  no token with write access to either repository is needed; it runs on demand and on a schedule;
- staging can't be mistaken for production: a visible "staging" banner, `noindex` and no
  sitemap, and its own Trystero `appId`, so staging and production peers never meet while the
  protocol changes;
- docs/RELEASES.md describes the flow: merge → staging → manual checks → tag → production; the
  release checklist runs against staging; a decision entry records it.

### 0.10.0: Safari and Edge coverage
**Goal:** the app is tested on the engines people actually use, notably iPhones: every iOS
browser runs on WebKit, Safari's engine.
**Done when:**
- the unit and end-to-end suites also run on **WebKit** (Playwright's WebKit build, already in the
  pinned test image), including cross-engine pairs such as a WebKit guest with a Chromium host;
- differences in WebRTC, Web Crypto, IndexedDB, Web Locks, downloads or the clipboard are fixed,
  or documented with a workaround;
- the release checklist includes a manual check on a **real iPhone with Safari** against staging
  (Playwright's WebKit is close to Safari, but not identical);
- **Edge**: it uses Chromium's engine, so the Chromium runs cover it; a dedicated Edge run (amd64
  only in containers) is added only if a real difference shows up. A manual check on Edge for
  Windows goes in the release checklist.

### 0.11.0: Standard encryption format
**Goal:** encrypt with a standard, audited format instead of our own framing, so reviewers check
a known construction rather than ours. See
[IDEAS.md](IDEAS.md#encrypt-share-payloads-in-the-age-format).
**Why before launch:** it changes the wire format, so old links and peers stop working. Before
1.0 that's a minor version; after it, a major one.
**Done when:**
- Share payloads use the **`age` format** (the `typage` library, pinned and bundled like
  Trystero); the key schedule is reviewed at the same time (e.g. scrypt as in `age`'s passphrase
  recipient, or our PBKDF2-derived key as an X25519 or symmetric recipient), and the choice is
  recorded as a decision;
- Chat's message framing is assessed for the same change; it either moves too or the reason it
  stays is documented;
- docs/PROTOCOL.md and the threat model are updated, the protocol version is bumped, and the
  release notes mark the change as breaking;
- unit and end-to-end tests cover the new format, including interoperability with the reference
  `age` tool for Share payloads.

### 0.12.0: Connectivity on restrictive networks
**Context:** direct connections work for most networks, but fail when both sides are behind
restrictive NATs (symmetric NAT, common on corporate networks and some mobile carriers) or when a
firewall blocks UDP. Industry estimates put the share of WebRTC sessions that need a relay at
roughly 10–25%. Today those users simply can't connect ([COMMUNICATION.md](COMMUNICATION.md),
[DECISIONS.md D5](DECISIONS.md)).
**Goal:** those users can still share securely, without weakening end-to-end encryption, and
everyone else keeps direct connections.
**Done when:**
- **clear failure handling:** the app notices when no direct path is found (ICE fails or times
  out) and tells users plainly what happened and what to try (another network, mobile data);
- **diagnostics:** a short, private connection report (which address types were found, whether
  UDP is blocked) to tell "restrictive NAT" from other failures;
- **relay fallback (TURN):** used only when a direct path fails. It carries traffic that is already
  DTLS-encrypted *and* encrypted by the app, so it can't read anything. It's reachable over UDP and
  over TLS on TCP 443, for firewalls that only allow HTTPS-like traffic;
- **relay provider decided**, preferring zero cost: self-hosted (e.g. coturn), or a free tier of a
  managed TURN service. What the relay operator sees (IP addresses, timing, volume) is documented
  in THREAT_MODEL.md;
- **no open relay for abuse:** short-lived, per-session TURN credentials;
- an **end-to-end test** where the direct path is blocked and the session must succeed through a
  local TURN container;
- COMMUNICATION.md, DECISIONS.md (D5) and THREAT_MODEL.md updated.

### 0.13.0: Static pages and SEO
**Goal:** people searching for how to send a password or a sensitive file securely find the app,
and shared links show a trustworthy preview. See
[the review](reviews/2026-10-12-ux-product-seo.md#7-seo-and-discoverability) and
[the static site assessment](reviews/2026-10-13-static-site-generation.md).
**Done when:**
- every tool has a real, **pre-rendered static page** (`/`, `/chat/`, `/passwords/`) whose
  content is in the HTML without JavaScript, plus `/how-it-works/` and `/faq/`; room secrets stay
  in the URL fragment;
- each page has a keyword-led title, meta description, canonical URL, Open Graph and Twitter card
  tags, and a social image (a placeholder until the logo exists); `WebApplication` and `FAQPage`
  structured data;
- `robots.txt`, `sitemap.xml`, favicon set, web manifest and `theme-color`;
- a short **privacy note** (in the FAQ) says what the app sends where and that it uses no cookies
  or trackers;
- the site is verified in Google Search Console and Bing Webmaster Tools (search impressions
  without any tracking script);
- Lighthouse CI (pinned container) runs in CI with budgets for SEO, accessibility and performance.

### 0.14.0: Pre-launch security review
**Goal:** what ships at 1.0 has been reviewed as a whole, by someone outside the project, and
nothing known is left open.
**Done when:**
- docs/PROTOCOL.md, the threat model and the code that implements them have been reviewed by
  someone outside the project, after 0.11.0 and 0.12.0 so the review covers the final format and
  the relay fallback;
- a full internal pass over the threat model checks each mitigation against the code and tests;
- every finding is fixed, or accepted with a documented reason; each fix comes with a regression
  test;
- open code scanning and Scorecard findings are triaged the same way.

### 1.0.0: Public launch
**Goal:** announce the app, once security basics, testing, the protocol and the static pages are
done.
**Done when:**
- production hosting is decided (see [IDEAS.md](IDEAS.md#hosting-github-pages-and-alternatives)):
  HSTS, CSP and `nosniff` as headers where the host allows it, or the documented compensations
  (CSP `<meta>`, frame-busting) where it doesn't;
- the release checklist (on staging) includes manual WebRTC tests across two networks, a real
  iPhone and Edge on Windows;
- a launch checklist lists the channels (Show HN, Reddit, Product Hunt, AlternativeTo, privacy
  tool directories) and what each requires, and the announcement goes out.

### 1.1.0: DAST and fuzzing
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

### 1.2.0: Security posture management
**Goal:** know at any time which security checks run, which pass, and which repository settings
protect the project, without re-checking hardening by hand on every commit. Builds on the basics
of 0.8.0.
**Done when:**
- the remaining tools are evaluated and chosen, preferring existing checks over custom rules:
  - Allstar (repository policy enforcement);
  - Checkov or Trivy config (Dockerfile, compose, workflows);
  - OSV-Scanner (dependencies, alongside Trivy);
  - legitify (GitHub repository and organisation settings);
  - custom Semgrep rules, only for what nothing else covers;
- every **OpenSSF Scorecard** check is cleared or has a documented reason (Signed-Releases with
  provenance, Fuzzing from 1.1.0, …), and the OpenSSF Best Practices badge is started;
- a scheduled workflow re-runs the posture checks, and docs/SECURITY_POSTURE.md lists each control,
  the tool that checks it, and its status;
- pre-commit automation is decided (see [IDEAS.md](IDEAS.md#pre-commit-checks)).

### 1.3.0: Share a generated password
**Goal:** generate a password and send it safely in one step.
**Done when:**
- each generated password has a **"Share securely"** button that opens Secure Share with the
  password as the text, a passphrase generated, and the one-time link ready to create;
- the password is handed over **in memory only**: never in the URL, history, storage or logs;
- covered by an end-to-end test (generate → share → receive the same password).

### 1.4.0: Local version of the app
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

### 1.5.0: AI-assisted memorable passphrases
**Goal:** an optional "make it a sentence" mode in which an on-device model turns CSPRNG-chosen
words and a number into a memorable phrase, before the usual random variation rules.
**Done when:** the design in [IDEAS.md](IDEAS.md#ai-assisted-memorable-passphrases) is
implemented, the output is validated to contain every chosen word, the shown strength counts only
CSPRNG choices, and it falls back cleanly when no on-device model is available.

### Unscheduled: Logo and visual identity
**Why no version:** it needs several iterations and feedback from people, and it doesn't affect
usability, so nothing waits for it. Pages use a placeholder social image until it's ready.
**Done when:** a logo exists for the app (and, if wanted, a mark for the organisation) as SVG plus
favicon, `apple-touch-icon`, manifest icons and a 1200 × 630 social image, and they replace the
placeholders. Released as a patch of whichever version is current.
