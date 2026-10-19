# CommonSec Share

*Part of [CommonSec](https://github.com/common-sec): practical security tools, researched in the open.*

**Try it:** https://share.common-sec.org/

**Share files and secrets directly between browsers, without storing them on anyone's server.**

Most ways of sending a password, a key or a confidential file to someone leave a copy behind: in a
chat history, an email server, a cloud drive, or a "one-time secret" service that stores it until
it's read. CommonSec Share moves the data **straight from one browser to the other**, encrypted end to
end, and keeps nothing afterwards. It's a static web page with no backend, no accounts, and no
tracking. You can read all of it, run it locally, or host it yourself.

The aim is to make secure sharing easy for anyone: **privacy by default, not anonymity**.

| Tool | What it does |
|---|---|
| **Secure Share** (home page) | Encrypted transfer from computer to computer, browser to browser: ideal for passwords and sensitive files, between any kind of user, with no special software. Send text and/or files once to one person. They need the link **and** a passphrase. Once delivered, the link is dead. |
| **Secure Chat** (`#/chat`) | For several things to exchange, replies, or more than two people: group chat with file sharing. The host approves every member, messages are signed and encrypted, and the room disappears when the host closes it. |
| **Password Generator** (`#/password`) | Memorable passphrases that are not just dictionary words (`Stone~Behind~Karrotish~Pencils42~Over~Quail`), or random-character passwords. |

## How it works, in short

1. The sender opens a room. The link carries a random 256-bit secret **after the `#`**, the part of
   a URL that browsers never send to any server. A separate passphrase is shared another way, for
   example read aloud on a call.
2. Both browsers find each other through a few **public Nostr relays** (via
   [Trystero](https://github.com/dmotz/trystero)). Only encrypted connection offers pass through
   them, and the browsers disconnect from the relays as soon as they're no longer needed.
3. The browsers connect **directly** with WebRTC, using public STUN servers to get through NATs.
   Data is encrypted twice: by WebRTC (DTLS) and by the app (AES-256-GCM, keyed from the link
   secret and the passphrase).
4. The host proves its identity, the guest proves the passphrase, the host approves, and both
   screens show a **safety code** to compare, which detects a man-in-the-middle.

There's no relay server for data (TURN), so if both sides are behind strict NATs or firewalls a
direct connection may be impossible. This is a deliberate trade-off: no third party ever carries
your data.

## Documentation

| Document | For |
|---|---|
| [docs/COMMUNICATION.md](docs/COMMUNICATION.md) | **How two browsers find each other and connect**, step by step with diagrams (Nostr, NAT, WebRTC) |
| [docs/DECISIONS.md](docs/DECISIONS.md) | The decisions behind the design, why, and when to revisit them |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Components, data flow, **network connections and ports**, third parties |
| [docs/PROTOCOL.md](docs/PROTOCOL.md) | Exact key derivation, handshake and message formats (for auditors) |
| [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) | What is protected, against whom, and the known limits |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | The containerised dev environment, pinning and supply-chain rules |
| [docs/RELEASES.md](docs/RELEASES.md) | Rebuilding a release and verifying its checksums against what is served |
| [docs/TESTING.md](docs/TESTING.md) | How the test suite works and how to run it |
| [SECURITY.md](SECURITY.md) | Reporting vulnerabilities, audit scope |
| [docs/ROADMAP.md](docs/ROADMAP.md) | App features (one per version) and user-facing fixes: what's next |
| [docs/IDEAS.md](docs/IDEAS.md) | Ideas waiting to be chosen for the roadmap |
| [docs/TODO.md](docs/TODO.md) | Internal work: platform, build, CI/CD and security process |
| [CHANGELOG.md](CHANGELOG.md) | What changed in each version |
| [docs/reviews/](docs/reviews/) | Reviews: [UX, product and SEO (2026-10-12)](docs/reviews/2026-10-12-ux-product-seo.md) |

## Run it

Everything runs in containers (Docker + Compose; see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)):

```bash
docker compose run --rm build                                         # type-check, build dist/, check it's reproducible
docker compose up web                                                 # app at http://127.0.0.1:8080
docker compose run --rm test-unit                                     # unit tests (Chromium, Firefox, WebKit)
docker compose run --rm test-e2e                                      # end-to-end tests through the real UI
docker compose run --rm semgrep                                       # or trivy, trufflehog
```

The built app (`dist/`) is static files: any static host works for deployment (GitHub Pages, Cloudflare
Pages, Netlify). The Web Crypto API needs a secure context (HTTPS or `localhost`).

## Design principles

- **No backend, no storage.** Nothing is uploaded, and nothing outlives the browser tab, except
  the host's non-extractable keys while a chat room is open (to survive a reload, not a closed
  tab). Rooms close on their own after a time limit (4 hours by default).
- **No hand-rolled cryptographic primitives.** All of them come from the browser's Web Crypto
  API: AES-GCM, ECDSA P-256, HKDF, PBKDF2, HMAC, SHA-256 and the CSPRNG. The protocol that combines
  them is documented in [PROTOCOL.md](docs/PROTOCOL.md) and covered by adversarial tests.
- **Minimal dependencies.** One runtime dependency (Trystero, locked), bundled at build time,
  no framework, no CDN. Every line that runs is in this repository or in the locked library.
- **Readable and verifiable.** Strict TypeScript, a strict Content Security Policy, and a
  [reproducible build](docs/RELEASES.md): anyone can check the served files match the source.
  Static analysis (Semgrep) runs on every push.
