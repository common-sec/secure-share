# Changelog

All notable changes, one section per version. See [docs/ROADMAP.md](docs/ROADMAP.md) for what's next.

## [Unreleased]

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
