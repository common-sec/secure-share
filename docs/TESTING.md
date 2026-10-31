# Testing

## Why everything runs in a browser

This app has no server: all of its logic runs in the browser and depends on browser APIs, namely
**Web Crypto** (keys, encryption, signatures), **WebRTC** (peer connections), **IndexedDB** and
**Web Locks** (host resume). Mocking those would test the mocks, so every test runs in **real
browsers** (Chromium, Firefox and WebKit), driven by **[Playwright](https://playwright.dev)**.

Playwright plays two roles:

| Level | What runs where | Playwright's role | Network |
|---|---|---|---|
| **Unit** (`tests/unit/`) | The tests are JavaScript modules **inside the page** (`tests/unit/index.html`). They import the app's modules (transpiled one-to-one into `build/modules/` by the build) and exercise them, including the full protocol between several in-page "peers" over an in-memory transport. | Starts each browser, opens the test page, waits, and collects the results the page reports | **None**, the container has no network |
| **End-to-end** (`tests/e2e/`) | The tests are Python scripts **outside the page**, against the built app in `dist/`. They act as users: several isolated browser contexts (host, guests, sender, recipient) click through the real UI. | Drives the browsers: opens pages, types, clicks, uploads and downloads files, reads what's on screen, runs accessibility checks | **Yes**: real WebRTC, real Trystero, a Nostr relay (local by default, public with `test-e2e-public`) |

So unit tests check the code's guarantees precisely and quickly, without depending on anything
outside the container. End-to-end tests check that real users in real browsers can actually do
the things the app promises, over the real network stack.

## Run it

Everything runs in containers (setup: [DEVELOPMENT.md](DEVELOPMENT.md)):

```bash
docker compose run --rm build              # first: type-check and build dist/ and build/modules/
docker compose run --rm test-unit          # unit tests (no network)
docker compose run --rm test-e2e           # end-to-end, local relay, no third-party requests (what CI runs)
docker compose run --rm test-e2e-public    # end-to-end over the real public relays and STUN
```

`test-unit` runs `python tests/unit/run.py chromium firefox webkit` in the `test` image, which is Microsoft's
pinned Playwright image plus the hash-pinned Python packages, baked in at build time (see
`Dockerfile`). It serves the repository on a loopback port, runs the suite in each browser,
prints every result and exits non-zero on any failure. Options go after the service name:

```bash
docker compose run --rm test-unit python tests/unit/run.py chromium --filter room
```

**In a normal browser** (exploring or debugging): after the build, serve the repository root
(`docker compose run --rm --service-ports -w /work web`, or any static server) and open
`/tests/unit/` (`?filter=room` works there too). `docker compose up web` serves only `dist/`.

## Unit tests: what is covered

| File | Covers |
|---|---|
| `random.test.js` | Range, invalid bounds, **uniformity (chi-squared)**, shuffle |
| `encoding.test.js` | base64url round-trips, large inputs, invalid input |
| `crypto.test.js` | Key agreement between both sides, **the passphrase never affects the signaling key**, tamper detection, fresh IVs, signatures, safety codes |
| `password.test.js` | Length, required sets, exclusions, entropy, impossible settings |
| `passphrase.test.js` | Never only dictionary words, structure, minimum strength, entropy monotonicity, syllable capitals, spelling rules |
| `room.test.js` | The protocol between host and guests, including attacks: wrong passphrase, **auto-lock**, declined and pending guests, unique nicknames, **impostor host with link + passphrase**, star topology, **forged and tampered messages**, **replays**, wrong-key data, **files that don't match their signed hash**, removal, **relay disconnection**, host reload, **room time limit** (host and stranded guests close, cap, not extended by a reload) |
| `hoststore.test.js` | Host resume only across a reload: closed-tab and expired records are refused, the sweep deletes them |
| `files.test.js` | Encrypted files, with the lockfile's openpgp.js: **the GnuPG profile** (SKESK v4, AES-256, highest S2K count, SEIPD v1), round trips of one file and of a ZIP package, **wrong password, flipped byte and cut-off file refused**, not-OpenPGP and **public-key files told apart**, armored and compressed messages (as gpg writes them), size limit, safe download names; ZIP packages from the lockfile's client-zip: paths, contents and CRCs read back from the central directory, UTF-8 names, **paths that can't climb out**, duplicate names |

### How the unit tests work

- `tests/unit/harness.js`: a tiny test framework, about 60 lines with no dependencies
  (`test`, `assert`, `run`).
- `tests/unit/runner.js`: imports every `*.test.js` file, runs them, renders the results on the
  page, and exposes them as `window.__TEST_RESULTS__` for Playwright.
- `tests/unit/fake-transport.js`: an in-memory implementation of the part of Trystero's API that
  `SecureRoom` uses: `joinRoom`, handshakes, actions, `getPeers`, relay sockets, pause/resume.
  `SecureRoom.host/join` accept a `transport` option, so a test creates several "browsers" on one
  `FakeNetwork` and runs the real protocol code between them. Adversarial tests use a real
  member's keys to craft malicious packets directly.
- `tests/unit/run.py`: the Playwright driver for the container and CI.

### Checking that tests catch regressions

Security tests must fail when the protection they guard is removed. For example, deleting the
signature check in `#verifyEnvelope` (src/lib/room.ts) makes *"a member cannot forge messages as
another member"* fail. Do such mutation checks by hand when changing the protocol. Systematic
fuzzing is planned in [TODO.md I7](TODO.md#i7-dast-and-fuzzing).

## End-to-end tests

`tests/e2e/run.py` acts out what people do with the app. Each person is a separate, isolated
browser context: own storage, own WebRTC identity, possibly a different browser. Playwright
clicks, types, uploads and downloads files exactly as a user would, and the peers connect over
**real WebRTC with the real Trystero**.

| Scenario | Browsers |
|---|---|
| Share: text **and a file** delivered (byte-for-byte), then the one-time link is dead | Chromium, Firefox, WebKit |
| Share: a wrong passphrase is refused, and the sender is told | Chromium |
| Share: with "Ask me before delivering", nothing is sent until the sender clicks Deliver | Chromium |
| Chat: host approves two guests; messages and a **file** relay guest → host → guest; a member is removed | Chromium, Firefox, WebKit |
| Chat: a declined guest is told and gets nothing | Chromium |
| Chat: a wrong passphrase is refused, and the host is told | Chromium |
| Chat: a locked room can't be joined | Chromium |
| Share **across browsers**: text and a file delivered, sender on one engine and recipient on another | Every ordered pair of different engines (6) |
| Chat **across browsers**: a guest is admitted and messages flow both ways, host on one engine and guest on another | Every ordered pair of different engines (6) |
| Files: one file and a **folder plus a file** (a ZIP package) encrypted in the page **with no network**, then **decrypted by `gpg`** (contents, the stored name) and by the page | Chromium, Firefox, WebKit |
| Files: what **`gpg` encrypts** with a password (its defaults: compressed; and armored `.asc`) opens in the page | Chromium, Firefox, WebKit |
| Files: a wrong password and a damaged file are refused, and nothing is offered | Chromium |
| Accessibility (axe-core) on the share form, waiting and received states, the chat form and room (host and guest), the files page (encrypt, encrypted, decrypt, decrypted) and the password page | Chromium, Firefox, WebKit (password page: Chromium) |

### Two modes

- **`test-e2e` (default, CI): local relay.** `tests/e2e/server.py` serves the app and a minimal
  Nostr relay (RFC 6455 WebSocket plus the part of NIP-01 that Trystero uses, standard library
  only) on **the same origin**, so the app's Content Security Policy applies unchanged. The test
  injects two **test-only hooks** before the page loads: `__USS_TEST_RELAYS__` (relay URLs) and
  `__USS_TEST_ICE_SERVERS__` (empty, so host candidates only and no STUN). They can only be set
  by a script already running in the page, which has full control anyway, so links and user
  input can't reach them. Runs are fast and deterministic. Since Trystero is bundled into the
  build, the app needs no third party at all, and the tests enforce it: each browser context
  **blocks every request (HTTP or WebSocket) that isn't to the local test server**, and a
  scenario fails if the app tried one. (A Docker `internal` network isn't used for this, because
  browsers gather no WebRTC candidates at all on a machine without a default route.)
- **WebKit and mDNS.** WebKit, like Safari, always hides its host ICE candidates behind random
  `<uuid>.local` mDNS names, with no switch to turn that off (Chromium and Firefox have one, which
  the tests set). Nothing resolves mDNS in the container, so two WebKit peers could never connect on host
  candidates alone. The test server therefore also runs a minimal **local STUN server** (Binding
  only, standard library, on the container's own address), and WebKit contexts get it as their
  only ICE server: each WebKit peer learns its real container address as a server-reflexive
  candidate, as Safari does from a public STUN server on the internet. Nothing leaves the
  container, and Chromium and Firefox still use host candidates only.
- **GnuPG** is the reference tool for the encrypted files page. The test image has `gpg` 2.4 and
  installs its agent (`gpg-agent`, which password encryption needs) from a dated Ubuntu archive
  snapshot (see the Dockerfile). Each call gets a fresh, temporary GnuPG home.
- **Offline.** The files scenarios cut the network once the page's library has loaded
  (Playwright's offline mode; in WebKit, every request refused instead, because its offline mode
  also breaks reading local files, which Safari doesn't).
- **`test-e2e-public`: real world.** Nothing is injected: the app uses the real public Nostr
  relays and STUN servers, exactly as on the live site. It tests real-world networking, and
  depends on those third parties being up, so it isn't a CI gate.

### Accessibility

Every audited page state runs **axe-core** (via `axe-playwright-python`, hash-pinned).
`tests/e2e/axe-baseline.json` lists the findings that are known and accepted until the accessibility items (A1–A4) in the [roadmap's fixes](ROADMAP.md#fixes-and-small-improvements)
fixes them (colour contrast, heading order, unlabelled fields on the password page). Any finding
not in that list fails the run. To review the current findings:
`docker compose run --rm -e E2E_AXE_RECORD=1 test-e2e` prints them instead of failing.

## Browsers and engines

| Browser people use | Engine | How it's covered |
|---|---|---|
| Chrome, Brave, Opera, Samsung Internet, **Edge** (desktop and Android) | Blink (Chromium) | Playwright's Chromium, unit and end-to-end |
| Firefox (desktop and Android) | Gecko | Playwright's Firefox, unit and end-to-end |
| **Safari** (macOS), and **every browser on iPhone and iPad** (Safari, Chrome, Firefox, Edge for iOS) | WebKit | Playwright's WebKit, unit and end-to-end, plus a manual check on a real iPhone before each release |

**Edge** runs Chromium's engine, so the Chromium runs cover it; no Edge-specific difference has
shown up, so there is no dedicated Edge run (Playwright's `msedge` channel is amd64-only in
containers and not in the pinned image). One gets added if a real difference appears. A manual
check on Edge for Windows is part of the release checklist ([RELEASES.md](RELEASES.md#making-a-release)).

**WebKit vs Safari:** Playwright's WebKit is built from the same engine as Safari, but it isn't
Safari: the Linux build has its own networking and media stack, and no iOS-specific behaviour
(background tabs being suspended, the share sheet, downloads in the Files app). Hence the manual
iPhone check. With WebKit added, the suites found no difference in Web Crypto, IndexedDB, Web
Locks, WebRTC data channels or downloads; the one difference, mDNS host candidates, is a property
of the test container (see above), not of the app. The clipboard (the Copy buttons) isn't
exercised by the automated tests in any browser; the manual checks cover it.

## Lighthouse budgets

`docker compose run --rm lighthouse` (after `build`) runs [Lighthouse](https://github.com/GoogleChrome/lighthouse)
on every page listed in `pages.mjs`, so a new page is audited without touching the setup, and
fails if a category scores below its budget in `tools/lighthouse/budgets.json`:

| Category | Budget | Why |
|---|---|---|
| Performance | ≥ 90 | The median of 3 runs; the margin absorbs run-to-run noise |
| Accessibility | 100 (home page: 96) | Deterministic. The home page's exception is the contrast of one link, fixed by roadmap fix A4 |
| Best practices | 100 | Deterministic |
| SEO | 100 | Deterministic: titles, descriptions, canonical URLs, crawlable links |

It uses Lighthouse's default mobile profile (a mid-range phone on slow 4G, simulated), so the
scores don't depend on how fast the machine is. The container is the pinned Playwright image (its
Chromium), with Lighthouse installed from `tools/lighthouse/package-lock.json` under the same
`.npmrc` rules as the app; it has **no network**: `tools/serve.py` serves `dist/` on loopback, as
`docker compose up web` does. HTML and JSON reports land in `.cache/lighthouse/` (CI keeps them
as an artifact for 14 days). Lighthouse's accessibility checks are axe-core too, but on the
initial page only; the end-to-end tests above cover the other states.

**Lighthouse, not `@lhci/cli`:** Lighthouse CI's command line (last released June 2025) pins
Lighthouse 12 and a dependency tree with open high-severity advisories that Trivy would fail on.
`tools/lighthouse/run.mjs`, about a hundred lines, does the part we need (run, take the median,
compare to budgets, write reports) on current Lighthouse, whose tree has none.

## CI

`.github/workflows/ci.yml` runs on every push and pull request:
1. `build`: `docker compose run --rm build`: type-check, build, check that a second build is
   byte-identical, and print `dist/SHA256SUMS`.
2. `test-unit` and `test-e2e`: on Chromium, Firefox and WebKit; build the app, build the test image and run the same commands as locally.
3. `lighthouse`: build the app and the Lighthouse image, then check the budgets above; the
   reports are uploaded whether it passes or not.
4. `scan`: one job each for `trufflehog`, `semgrep` and `trivy` (see [DEVELOPMENT.md](DEVELOPMENT.md)).
