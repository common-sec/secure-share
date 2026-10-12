# Testing

## Why everything runs in a browser

This app has no server: all of its logic runs in the browser and depends on browser APIs, namely
**Web Crypto** (keys, encryption, signatures), **WebRTC** (peer connections), **IndexedDB** and
**Web Locks** (host resume). Mocking those would test the mocks, so every test runs in **real
browsers** (Chromium and Firefox), driven by **[Playwright](https://playwright.dev)**.

Playwright plays two roles:

| Level | What runs where | Playwright's role | Network |
|---|---|---|---|
| **Unit** (`tests/unit/`) | The tests are JavaScript modules **inside the page** (`tests/unit/index.html`). They import the app's modules directly and exercise them, including the full protocol between several in-page "peers" over an in-memory transport. | Starts each browser, opens the test page, waits, and collects the results the page reports | **None**, the container has no network |
| **End-to-end** (`tests/e2e/`) | The tests are Python scripts **outside the page**. They act as users: several isolated browser contexts (host, guests, sender, recipient) click through the real UI. | Drives the browsers: opens pages, types, clicks, uploads and downloads files, reads what's on screen, runs accessibility checks | **Yes**: real WebRTC, real Trystero, a Nostr relay (local by default, public with `test-e2e-public`) |

So unit tests check the code's guarantees precisely and quickly, without depending on anything
outside the container. End-to-end tests check that real users in real browsers can actually do
the things the app promises, over the real network stack.

## Run it

Everything runs in containers (setup: [DEVELOPMENT.md](DEVELOPMENT.md)):

```bash
docker compose run --rm test-unit          # unit tests (no network)
docker compose run --rm test-e2e           # end-to-end, local relay (what CI runs)
docker compose run --rm test-e2e-public    # end-to-end over the real public relays and STUN
```

`test-unit` runs `python tests/unit/run.py chromium firefox` in the `test` image, which is Microsoft's
pinned Playwright image plus the hash-pinned Python packages, baked in at build time (see
`Dockerfile`). It serves the repository on a loopback port, runs the suite in each browser,
prints every result and exits non-zero on any failure. Options go after the service name:

```bash
docker compose run --rm test-unit python tests/unit/run.py chromium --filter room
```

**In a normal browser** (exploring or debugging): `docker compose up web` and open
http://127.0.0.1:8080/tests/unit/ (`?filter=room` works there too).

## Unit tests: what is covered

| File | Covers |
|---|---|
| `random.test.js` | Range, invalid bounds, **uniformity (chi-squared)**, shuffle |
| `encoding.test.js` | base64url round-trips, large inputs, invalid input |
| `crypto.test.js` | Key agreement between both sides, **the passphrase never affects the signaling key**, tamper detection, fresh IVs, signatures, safety codes |
| `password.test.js` | Length, required sets, exclusions, entropy, impossible settings |
| `passphrase.test.js` | Never only dictionary words, structure, minimum strength, entropy monotonicity, syllable capitals, spelling rules |
| `room.test.js` | The protocol between host and guests, including attacks: wrong passphrase, **auto-lock**, declined and pending guests, unique nicknames, **impostor host with link + passphrase**, star topology, **forged and tampered messages**, **replays**, wrong-key data, **files that don't match their signed hash**, removal, **relay disconnection**, host reload |

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
signature check in `#verifyEnvelope` (src/lib/room.js) makes *"a member cannot forge messages as
another member"* fail. Do such mutation checks by hand when changing the protocol. Systematic
fuzzing is planned for roadmap 0.11.0.

## End-to-end tests

`tests/e2e/run.py` acts out what people do with the app. Each person is a separate, isolated
browser context: own storage, own WebRTC identity, possibly a different browser. Playwright
clicks, types, uploads and downloads files exactly as a user would, and the peers connect over
**real WebRTC with the real Trystero**.

| Scenario | Browsers |
|---|---|
| Share: text **and a file** delivered (byte-for-byte), then the one-time link is dead | Chromium, Firefox |
| Share: a wrong passphrase is refused, and the sender is told | Chromium |
| Share: with "Ask me before delivering", nothing is sent until the sender clicks Deliver | Chromium |
| Chat: host approves two guests; messages and a **file** relay guest → host → guest; a member is removed | Chromium, Firefox |
| Chat: a declined guest is told and gets nothing | Chromium |
| Chat: a wrong passphrase is refused, and the host is told | Chromium |
| Chat: a locked room can't be joined | Chromium |
| Chat **across browsers**: Chromium host, Firefox guest | Chromium + Firefox |
| Accessibility (axe-core) on the share form, waiting and received states, the chat form and room (host and guest), and the password page | Chromium, Firefox |

### Two modes

- **`test-e2e` (default, CI): local relay.** `tests/e2e/server.py` serves the app and a minimal
  Nostr relay (RFC 6455 WebSocket plus the part of NIP-01 that Trystero uses, standard library
  only) on **the same origin**, so the app's Content Security Policy applies unchanged. The test
  injects two **test-only hooks** before the page loads: `__USS_TEST_RELAYS__` (relay URLs) and
  `__USS_TEST_ICE_SERVERS__` (empty, so host candidates only and no STUN). They can only be set
  by a script already running in the page, which has full control anyway, so links and user
  input can't reach them. Runs are fast and deterministic. The one outside dependency left is
  the app loading Trystero from jsDelivr; once it's bundled (roadmap 0.10.0), this mode moves to
  an internal network with no internet at all.
- **`test-e2e-public`: real world.** Nothing is injected: the app uses the real public Nostr
  relays and STUN servers, exactly as on the live site. It tests real-world networking, and
  depends on those third parties being up, so it isn't a CI gate.

### Accessibility

Every audited page state runs **axe-core** (via `axe-playwright-python`, hash-pinned).
`tests/e2e/axe-baseline.json` lists the findings that are known and accepted until roadmap 0.7.0
fixes them (colour contrast, heading order, unlabelled fields on the password page). Any finding
not in that list fails the run. To review the current findings:
`docker compose run --rm -e E2E_AXE_RECORD=1 test-e2e` prints them instead of failing.

## CI

`.github/workflows/ci.yml` runs on every push and pull request:
1. `test-unit`: builds the test image and runs `docker compose run --rm test-unit`, the same command as locally.
2. `scan`: one job each for `trufflehog`, `semgrep` and `trivy` (see [DEVELOPMENT.md](DEVELOPMENT.md)).
