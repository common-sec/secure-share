# Testing

The suite runs **in a real browser**, so Web Crypto, IndexedDB and Web Locks are the real
implementations, not mocks. It needs no dependencies and makes no network connections.

## Run it

```bash
python tools/serve.py 8080
```

Open http://localhost:8080/tests/. Add `?filter=room` to run a subset, matched against the file and
test name.

Headless (what CI runs, needs Node):

```bash
npm i --no-save playwright@1.48.2
npx playwright install chromium firefox
node tests/run-headless.mjs chromium firefox
```

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
1. The browser suite in headless Chromium and Firefox.
2. Static checks: no external URLs other than the reviewed ones, and no `innerHTML`, `eval` or `new Function` in shipped code.

## Not yet covered

- Real WebRTC between two browsers over real relays. This is flaky and depends on third parties,
  so for now it's checked by hand before releases: create, join, approve, chat, send a file, Share
  delivery, from two different networks. Planned: an end-to-end Playwright test with two browser
  contexts and a local Nostr relay.
- UI behavior (DOM). Planned: Playwright tests for the main flows.
