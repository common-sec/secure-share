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
| Accessibility (axe-core) on the share form, waiting and received states, the chat form and room (host and guest), and the password page | Chromium, Firefox, WebKit (password page: Chromium) |

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

## CI

`.github/workflows/ci.yml` runs on every push and pull request:
1. `build`: `docker compose run --rm build`: type-check, build, check that a second build is
   byte-identical, and print `dist/SHA256SUMS`.
2. `test-unit` and `test-e2e`: on Chromium, Firefox and WebKit; build the app, build the test image and run the same commands as locally.
3. `scan`: one job each for `trufflehog`, `semgrep` and `trivy` (see [DEVELOPMENT.md](DEVELOPMENT.md)).
