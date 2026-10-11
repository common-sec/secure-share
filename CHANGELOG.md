# Changelog

All notable changes, one section per version. See [docs/ROADMAP.md](docs/ROADMAP.md) for what's next.

## [Unreleased]

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
