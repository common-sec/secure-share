# Testing

The suite runs **in a real browser**, so Web Crypto, IndexedDB and Web Locks are the real
implementations, not mocks. It needs no dependencies and makes no network connections.

## Run it

In containers, the same way on any machine and in CI (setup: [DEVELOPMENT.md](DEVELOPMENT.md)):

```bash
docker compose run --rm test-deps   # once, and whenever tests/requirements.txt changes
docker compose run --rm test        # Chromium + Firefox, headless, no network
```

`test` runs `python tests/run_headless.py chromium firefox` inside Microsoft's pinned Playwright
image. It serves the repository on a loopback port, runs the suite in each browser, prints every
result and exits non-zero on any failure. Pass options after the service name:

```bash
docker compose run --rm test python tests/run_headless.py chromium --filter room
```

**In a normal browser** (exploring or debugging): `docker compose up web` and open
http://127.0.0.1:8080/tests/ (`?filter=room` works there too).

Security scanning (Semgrep, Trivy, Gitleaks, project checks) is described in
[DEVELOPMENT.md](DEVELOPMENT.md#everyday-commands).

## What is covered

| File | Covers |
|---|---|
| `random.test.js` | Range, invalid bounds, **uniformity (chi-squared)**, shuffle |
| `encoding.test.js` | base64url round-trips, large inputs, invalid input |
| `crypto.test.js` | Key agreement between both sides, **the passphrase never affects the signaling key**, tamper detection, fresh IVs, signatures, safety codes |
| `password.test.js` | Length, required sets, exclusions, entropy, impossible settings |
| `passphrase.test.js` | Never only dictionary words, structure, minimum strength, entropy monotonicity, syllable capitals, spelling rules |
| `room.test.js` | The protocol end to end, including attacks: wrong passphrase, **auto-lock**, declined and pending guests, unique nicknames, **impostor host with link + passphrase**, star topology, **forged and tampered messages**, **replays**, wrong-key data, **files that don't match their signed hash**, removal, **relay disconnection**, host reload |

## How protocol tests work

`tests/fake-transport.js` is an in-memory implementation of the part of Trystero's API that
`SecureRoom` uses: `joinRoom`, handshakes, actions, `getPeers`, relay sockets and
pause/resume. `SecureRoom.host/join` accept a `transport` option, so tests create several
"browsers" on one `FakeNetwork` and run real protocol code between them. Adversarial tests use a
real member's keys to craft malicious packets directly.

## Checking that tests catch regressions

Security tests should fail when the protection is removed. For example, deleting the signature
check in `#verifyEnvelope` (src/lib/room.js) makes *"a member cannot forge messages as another
member"* fail. Run such mutation checks by hand when changing the protocol.

## CI

`.github/workflows/ci.yml` runs on every push and pull request:
1. `docker compose run --rm test-deps` and `docker compose run --rm test`, the same commands as locally.
2. Each scanner in its own job: `checks`, `gitleaks`, `semgrep`, `trivy`.

## Not yet covered

- Real WebRTC between two browsers over real relays. This is flaky and depends on third parties,
  so for now it's checked by hand before releases: create, join, approve, chat, send a file, Share
  delivery, from two different networks. Planned: an end-to-end Playwright test with two browser
  contexts and a local Nostr relay.
- UI behavior (DOM). Planned: Playwright tests for the main flows.
