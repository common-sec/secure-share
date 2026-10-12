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
| **End-to-end** (`tests/e2e/`, roadmap 0.4.0) | The tests are Python scripts **outside the page**. They act as users: several isolated browser contexts (host, guests) click through the real UI. | Drives the browsers: opens pages, types, clicks, uploads files, reads what's on screen | **Yes**: real WebRTC, Trystero, a Nostr relay, STUN |

So unit tests check the code's guarantees precisely and quickly, without depending on anything
outside the container. End-to-end tests check that real users in real browsers can actually do
the things the app promises, over the real network stack.

## Run it

Everything runs in containers (setup: [DEVELOPMENT.md](DEVELOPMENT.md)):

```bash
docker compose run --rm test-unit
```

This runs `python tests/unit/run.py chromium firefox` in the `test` image, which is Microsoft's
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
fuzzing is planned for roadmap 0.6.0.

## End-to-end tests (planned, roadmap 0.4.0)

A `test-e2e` service, with network, will drive several browser contexts through real flows:
- create a chat room, join with the passphrase, approve, exchange messages and files, remove a member;
- a Secure Share delivery, after which the link is dead;
- wrong passphrase, declined guest, locked room.

In CI, discovery uses a pinned local Nostr relay container on an isolated network, so runs are
deterministic and don't depend on public relays. An optional run uses the real public relays.

## CI

`.github/workflows/ci.yml` runs on every push and pull request:
1. `test-unit`: builds the test image and runs `docker compose run --rm test-unit`, the same command as locally.
2. `scan`: one job each for `trufflehog`, `semgrep` and `trivy` (see [DEVELOPMENT.md](DEVELOPMENT.md)).
