# Changelog

All notable changes, one section per version. See [docs/ROADMAP.md](docs/ROADMAP.md) for what's next.

## [Unreleased]

### Changed
- **The waiting screen is the instructions** (roadmap G4), as three numbered steps that tick as
  they happen: 1. the link is copied, paste it in your chat (Copy again, Share…, Send with, QR code, and the link
  itself under "Show the link"); 2. tell them these words, shown large and word by word, masked
  until you click Show, with a line for when you're not on a call; 3. keep this page open, with
  **Keep my screen on** where the browser supports it. With "Check who's receiving" on, step 2
  asks you to read your code to them, with Deliver and Decline.
- **The link is copied for you** (roadmap G3). Creating a Share copies a
  short invitation straight away: "I’m sending you something privately with CommonSec Share.
  Open this link, and I’ll tell you the words: https://…". It never contains the passphrase. The
  screen says "Link copied ✓ Paste it in your chat with them", or asks you to copy the link if
  the browser refused. "Copy link only", "Copy invitation" and the system share sheet (where
  available) are next to it, plus **Send with** Email, Gmail, Outlook, WhatsApp, Telegram or
  Teams (plain links: the mail app or the service's official compose/share page, nothing loaded
  from them until clicked) and a **QR code** of the link
  for a recipient in the same room. Slack and Google Chat have no share link; Copy and the share
  sheet cover them.
- **A second runtime dependency:** `qrcode-generator@2.0.4` (MIT, no dependencies) computes the
  QR code; it's locked, bundled and loaded only when the QR code is shown (decision D13).
- **One question, one button** to create a Share (roadmap G2). The page asks "What do you want
  to send?", with "+ Add files" (or drop files anywhere on the card) and **Create link**. The
  passphrase is generated when the link is created and shown on the next screen. Choosing your
  own words and checking who's receiving are under **More options**. "Keep the screen on" moved
  to the waiting screen, and the longer explanations and "Which one should I use?" moved to a
  **How it works** box under the form, leaving one line that points to Secure Chat.
- **Room passphrases you can say aloud** (roadmap G1). Chat and Share now generate six random
  lowercase words separated by spaces, e.g. `ginger mule honey hen wizard lotus`, picked
  independently from the full list of 877 words: about 59 bits, at least as strong as the
  previous three bent words with a symbol, capitals and a number (about 57). They're matched
  exactly as typed (only leading and trailing spaces are ignored); key derivation is unchanged.
  Instead of "Fair · ≈57 bits", the sender sees "Strong enough for this one-time link ✓" (Chat:
  "for this room"); the strength meter appears only once the passphrase is edited. Passphrase
  fields turn autocorrect off, and the typed-passphrase estimate no longer counts spaces.
- **Guided sharing is the next release, 0.8.0.** Items G1–G5 from the guided sharing UX review
  moved from the fixes list to a roadmap feature of their own, ahead of the rest; the `age`
  format is now 0.9.0, the relay fallback 0.10.0 and static pages 0.11.0.
- **Pages deploys from `main`**, the renamed default branch; nothing had deployed since #21.

## [0.7.0] - 2026-10-24

### Security
- **The chat passphrase is no longer stored in the browser** (code scanning alert #1). It used to
  be kept in clear in sessionStorage so the host could see it after a reload; now it stays in
  memory only (roadmap fix K1).
- **The host's saved room state only survives a reload.** It used to stay in IndexedDB for up to
  24 h after the tab closed; now it's refused and deleted 2 minutes after the page stops
  refreshing it, and stale records are swept on every visit (roadmap fix K2).
- **Rooms close on their own after a time limit**: 4 hours by default, 1 to 24 hours under
  "Advanced options" when creating a chat. The host sees the closing time when the room is
  created, guests when they're admitted, the Share sender under the link, and everyone is warned
  10 minutes before. Guests waiting for a host that never returns stop too. Protocol: `welcome`
  carries the time left and `bye` has a new `expired` reason; older peers ignore both (roadmap fix K3).

### Added
- **Safari's engine is tested.** The unit and end-to-end suites also run on **WebKit** (Safari, and
  every browser on iPhone and iPad), and every pair of different engines is tested in both
  directions, for Share (sender → recipient) and Chat (host → guest). All 50 unit tests and every end-to-end
  scenario pass unchanged on WebKit: no app change was needed. WebKit hides host ICE candidates
  behind mDNS names, so the end-to-end test server also runs a tiny local STUN server for WebKit
  contexts; nothing leaves the container. Edge is covered by the Chromium runs (same engine); the
  release checklist now includes manual checks on a real iPhone with Safari and on Edge for
  Windows. See [docs/TESTING.md](docs/TESTING.md#browsers-and-engines).
- **The sender's screen can stay on while waiting:** an opt-in "Keep the screen on while waiting"
  option (Screen Wake Lock, off by default, with a warning not to leave the device unattended;
  taken again when the tab comes back). The form explains before the link exists that the page
  must stay open; while the tab is in the background its title says "⚠ Keep this tab open", and
  on return a note repeats it (TODO S1).
- **"✓ Delivered" in the tab title** when the delivery completes, so it shows from another tab
  (TODO S5).
- **Received text is masked**, with Show, Copy and "Clear from screen" (TODO R2).

### Changed
- **Guided sharing UX review.** A second UX review,
  [docs/reviews/2026-10-19-ux-guided-sharing.md](docs/reviews/2026-10-19-ux-guided-sharing.md),
  writes user stories for Share (designed first for use on a call: link in the chat, passphrase
  said aloud) and reviews the sender and recipient pages. Its items G1–G5 (speakable passphrases,
  a one-question creation page, the link copied automatically, guided waiting and recipient
  screens) are on the roadmap before 0.8.0 and cover the open S2, S3, S6, R1, R4 and R5.
- **Roadmap and internal work are split.** [docs/ROADMAP.md](docs/ROADMAP.md) now lists only app
  features and user-facing fixes (the fixes that were in TODO.md moved there, same IDs).
  Platform, build, CI/CD, testing and security process work moved to
  [docs/TODO.md](docs/TODO.md) as items I1–I8, which ship in the next release without a feature
  version. Planned features were renumbered: `age` format 0.8.0, relay fallback 0.9.0, static
  pages 0.10.0, then 1.0.0, and 1.1.0–1.3.0 after launch. Both lists stay files edited through
  pull requests rather than GitHub Issues or Projects (decision D18).
- The waiting screen hides the intro and shows only the steps and the status (TODO S4).
- The approval option reads "Let me check who’s receiving before sending" (TODO S7).
- The recipient's tab title is "You’ve received a secure delivery" (TODO R3).
- **Accessibility:** every visible label is tied to its field, including the message box, and
  the Passwords page's fields (its `label` and `select-name` axe findings are gone); Share's
  status lines are announced to screen readers (TODO A1, A3).
- **The site is at https://share.common-sec.org/**, a custom domain on GitHub Pages: verified for
  the organisation, HTTPS enforced. The previous `common-sec.github.io/secure-share/` address
  redirects to it. README, decisions (D19, D21), release guide and roadmap updated.
- **Roadmap reordered** for a site that is already public: GitHub hardening basics (0.8.0),
  staging and production from release tags only (0.9.0), Safari/WebKit (0.10.0), the standard
  `age` encryption format (0.11.0, breaking), an end-to-end encrypted relay fallback for
  restrictive networks (0.12.0), static pages and SEO (0.13.0), a pre-launch security review
  (0.14.0), then the public launch as 1.0.0. DAST and fuzzing, full posture management, sharing a
  generated password, the local version and AI passphrases follow 1.0. The names,
  organisation and domain item is closed as 0.7.0; the logo is unscheduled; support links became
  TODO items.
- **Anyone can deploy their own copy:** the repository the footer links to is a build variable,
  `BUILD_REPOSITORY` (default `https://github.com/common-sec/secure-share`); the Pages and Release
  workflows set it to the repository they run in, so a fork links to itself. `docker compose run
  --rm build` now also passes `BUILD_COMMIT` through, as the release guide already said it did.

## [0.6.2] - 2026-10-14

### Changed
- **New names.** The app is **CommonSec Share**, part of the **CommonSec** organisation
  ([decision D21](docs/DECISIONS.md)). Header, page titles, README, docs and package name updated;
  the tools keep their headings (Secure Share, Secure Chat, Password Generator).
- **New home:** the repository moved to `common-sec/secure-share`; the site is at
  https://common-sec.github.io/secure-share/ (the old `gum0x.github.io/user-sec-tools` address no
  longer works). `share.common-sec.org` comes next.
- Release artifacts are named `commonsec-share-vX.Y.Z` (earlier releases: `secure-sharing-…`).
- Unchanged on purpose: the protocol's Trystero `appId`, so peers keep finding each other.

## [0.6.1] - 2026-10-12

### Fixed
- **Release tarballs are now reproducible on any machine.** In 0.6.0 the files inside matched,
  but the archive kept the checkout's permissions (e.g. `777` on a Windows drive in WSL), so a
  rebuilt tarball's checksum could differ. `tools/package.py` (new `package` service, pinned
  Python image) writes every header field explicitly.
- `dist/` no longer contains `.nojekyll`: Pages deploys from a workflow, which doesn't use Jekyll
  and doesn't serve hidden files, so `SHA256SUMS` listed a file the site didn't have.

### Verified
- Rebuilding `v0.6.0` reproduced every file in its `SHA256SUMS`, and the live site served the
  same files (except `.nojekyll`, fixed above).

## [0.6.0] - 2026-10-12

### Added
- **Reproducible build**: `build.mjs` (esbuild) bundles the app into `dist/`. Building the same
  commit twice gives byte-identical files, and `npm run build:check` fails otherwise. Every build
  writes `dist/SHA256SUMS`.
- `docker compose run --rm build`: `npm ci`, type-check, build and reproducibility check in the
  pinned dev image. CI runs it on every push and prints the checksums.
- **GitHub Pages deploys the built `dist/`** from a workflow (`pages.yml`); **releases** for every
  `vX.Y.Z` tag publish a deterministic tarball and its checksums (`release.yml`).
- The footer shows the **build version** (`v0.6.0 · build <commit>`), linking to the commit.
- [docs/RELEASES.md](docs/RELEASES.md): how to rebuild a release and verify what the site serves.

### Changed
- **Sources are strict TypeScript.** Protocol messages are typed and validated as in
  [PROTOCOL.md](docs/PROTOCOL.md); `SecureRoom` events are a typed map.
- **Trystero is installed from npm** (`package-lock.json`, integrity hashes, `npm ci`) and bundled
  as a lazily loaded chunk. **No CDN at runtime**: the CSP allows scripts only from `'self'`.
- `index.html` moved to `src/`. `docker compose up web` serves `dist/`.
- Unit tests import the transpiled modules (`build/modules/`); end-to-end tests run against
  `dist/` and **block every third-party request** (a scenario fails if the app tries one).
- Semgrep also runs its TypeScript rules.

## [0.5.0] - 2026-10-12

### Added
- **End-to-end tests** (`tests/e2e/`): Playwright acts as several people in isolated browser
  contexts, through the real UI, over real WebRTC with the real Trystero. They cover Share
  (delivery of text and a file, dead link afterwards, wrong passphrase, approval) and Chat (approve
  guests, relayed messages and files, remove, decline, wrong passphrase, locked room), in Chromium,
  Firefox and **across the two**.
- `test-e2e`: a local Nostr relay built into the test server (same origin, CSP untouched) with
  host-only ICE; fast and deterministic. `test-e2e-public`: the same scenarios against the real
  public relays and STUN servers.
- **Accessibility checks** with axe-core (`axe-playwright-python`, hash-pinned) on every main page
  state; known findings listed in `tests/e2e/axe-baseline.json` until roadmap 0.7.0, new ones fail.
- Test-only hooks in `SecureRoom` for relay URLs and ICE servers (documented in ARCHITECTURE.md).
- CI runs the end-to-end tests.

### Changed
- Roadmap order: E2E tests first, then name and organisation (0.6.0), sending and receiving UX
  (0.7.0), and the new one-step password sharing (0.8.0).

## [0.4.1] - 2026-10-12

### Changed
- Secure Share explains what it is: encrypted transfer from computer to computer, browser to
  browser; ideal for passwords and sensitive files between any kind of user; no special software
  needed; Secure Chat for longer or back-and-forth exchanges.
- Roadmap 0.6.0 (TypeScript build) now includes showing the build version in the app.

## [0.4.0] - 2026-10-12

Feedback from the first real-world test (two devices on different networks, mobile data and wifi; Chat and Share both
worked across NAT).

### Changed
- **Secure Share is the home page**, with a short guide on when to use Secure Chat instead.
- The app is named **Secure Sharing**. The page title names the tool in use (Share once / Chat /
  Passwords), and the navigation reads Share · Chat · Passwords.
- **Room passphrases have no fixed pattern**: capitals, a number on a random word, one random
  separator, and the linking word at a random position (about 57 bits).
- Passphrase generator: half the words keep their plain form (not every word is bent), and
  linking words go in randomly chosen gaps. Strength stays exact, counting these choices.

### Added
- Strength meter on room passphrases: exact for generated passphrases, a conservative estimate
  (`src/lib/strength.js`) for typed or edited ones.
- Passphrases and room links are masked by default wherever they're entered or shown, with a
  Show/Hide toggle.
- Shared UI widgets (`src/tools/widgets.js`): strength meter, reveal toggle, passphrase field, copy row.
- Unit tests: no-pattern checks, room passphrase format, strength estimate (50 tests).

### Removed
- The separate home page (`src/tools/home.js`).

## [0.3.1] - 2026-10-12

### Changed
- Secret scanning uses **TruffleHog** (git history + working tree, no network, no verification
  calls) instead of Gitleaks.
- The test image is built from the Dockerfile (`test` target): Microsoft's pinned Playwright image
  plus the hash-pinned Python packages, installed at build time under `pip.conf`. This replaces
  the `test-deps` step; test runs need no network.
- Unit tests moved to `tests/unit/` and run as the `test-unit` service
  (`tests/unit/run.py`, formerly `tests/run_headless.py`).
- The Claude Code preview starts the app with `docker compose up web`.
- docs/TESTING.md explains how Playwright runs unit tests (in the page) and e2e tests (driving the UI).

### Removed
- `scripts/static-checks.sh` and the `checks` service: the hardening they re-checked is in place;
  ongoing tracking is planned as posture management (0.8.0).

## [0.3.0] - 2026-10-12

### Added
- **Containerised development**: `compose.yaml` runs every task in its own container: `dev` (Node
  24 + npm, the only image we build), `web`, `test-deps` / `test` (Microsoft's Playwright image),
  `checks`, `gitleaks`, `semgrep`, `trivy`. Each runs non-root, with no capabilities, a read-only
  root filesystem, `no-new-privileges`, and a read-only project mount where possible. Tests and
  checks run with no network.
- **Pinning everywhere**: images by tag + digest; GitHub Actions by commit SHA; Python test
  packages (full tree) by exact version + SHA-256 hashes.
- **Supply-chain rules**: `.npmrc` (`ignore-scripts`, `min-release-age=7`, `save-exact`) and
  `pip.conf` (`require-hashes`, wheels only, `uploaded-prior-to = P7D`), matched by a 7-day
  Dependabot cooldown for docker, docker-compose, pip, npm and actions.
- `scripts/static-checks.sh` fails if anything loses its pin or hardening.
- `scripts/setup-docker-wsl.sh`: check, Compose-only, or full rootless Docker setup in WSL.
- docs/DEVELOPMENT.md.

### Changed
- CI runs the same containers: the test job plus one job per scanner.
- Test tooling updated to Playwright 1.63.0.

## [0.2.0] - 2026-10-11

### Added
- `python tests/run_headless.py`: one command that runs the browser test suite headlessly, on a
  developer machine and in CI alike (Chromium, Firefox, or an installed Edge/Chrome; `--filter`).
- `tests/requirements.txt` pins the test tooling (Playwright).

### Changed
- CI runs the same Python command instead of a separate Node script (removed `tests/run-headless.mjs`).
- `tools/serve.py` can be imported by the test runner (port parsing moved under `__main__`).

## [0.1.0] - 2026-10-11

### Added
- **Password generator:** memorable passphrases (real words with odd endings, at least one
  sound-alike respelling, linking words, one random separator, capitals and a number, about 80 bits
  by default) and random-character passwords. Exact entropy estimates; settings saved in the URL.
- **Secure Chat:** host-approved group chat with file sharing over WebRTC (star topology through
  the host). Host authenticated by a key fingerprint in the link, passphrase proven by
  challenge-response, auto-lock after 5 wrong attempts, signed and AES-GCM encrypted messages,
  safety codes. The host can reload without losing the room.
- **Secure Share:** one-way, one-time delivery of text and files, protected by link and passphrase.
- Relays used only while the room needs to be discoverable (3 relays).
- Docs: architecture (network connections and ports), protocol spec, threat model, testing, security policy.
- In-browser test suite with an in-memory transport and adversarial protocol tests; CI workflow.
