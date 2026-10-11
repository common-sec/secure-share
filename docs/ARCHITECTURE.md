# Architecture

## Components

```
index.html  ── strict CSP, loads src/main.js (hash router)
│
├── src/tools/             UI, one module per tool
│   ├── password.js        password / passphrase generator
│   ├── chat.js            Secure Chat UI
│   └── share.js           Secure Share UI (sender + recipient)
│
├── src/lib/               logic, no DOM except dom.js
│   ├── random.js          unbiased CSPRNG helpers (crypto.getRandomValues + rejection sampling)
│   ├── passphrase.js      passphrase generator + exact entropy estimates
│   ├── words.js           word list used by the generator
│   ├── crypto.js          key derivation, AES-GCM, ECDSA, HMAC, safety codes (Web Crypto only)
│   ├── room.js            SecureRoom: the protocol (handshake, approvals, relay, files)
│   ├── hoststore.js       resume hosting after a reload (IndexedDB + Web Locks)
│   ├── encoding.js        base64url / UTF-8
│   └── dom.js             tiny DOM builder (text nodes only, never innerHTML)
│
└── src/vendor/trystero.js the single third-party import (pinned version)
```

`SecureRoom` (src/lib/room.js) is the core. Chat and Share are thin UIs on top of it:

| | Chat | Share |
|---|---|---|
| Host | whoever creates the room | the sender |
| Guests | up to 7, each approved by the host | exactly 1 recipient, auto-accepted once the passphrase is proven (optionally approved) |
| After use | open until the host closes it | closes after the recipient confirms receipt |

## Data flow

```
 Sender / host browser                                         Recipient / guest browser
 ─────────────────────                                         ─────────────────────────
 creates room: roomId, link secret, host ECDSA key
 link = …#/chat?r=<roomId>&k=<secret>&h=<host key fingerprint>  ── shared by the user ──▶
 passphrase                                                     ── shared separately ──▶

        │  WSS: encrypted WebRTC offer/answer               │
        └──────────▶  public Nostr relays (3)  ◀────────────┘
                         (discovery only)

        │  UDP: STUN binding requests (learn public IP:port) │
        └──────────▶  stun.l.google.com / stun.cloudflare.com ◀┘

        ◀═════════════ WebRTC data channel (DTLS/SCTP over UDP, direct) ═════════════▶
          1. handshake: host signature, passphrase proof (HMAC), result
          2. host approval, safety code comparison
          3. signed + AES-GCM-encrypted messages and files
```

With several guests the topology is a **star**: every guest connects only to the host, and the host
relays signed, encrypted messages. Guests never connect to each other, so they never learn each
other's IP addresses.

## Network connections and ports

Everything the app connects to, and when:

| Destination | Protocol / port | When | What is sent | Who sees what |
|---|---|---|---|---|
| The static host serving the page | HTTPS, TCP 443 | Page load | Standard GET requests. The URL fragment (room secrets) is **never** sent. | Host operator: your IP, page requests |
| `cdn.jsdelivr.net` | HTTPS, TCP 443 | Opening Chat or Share | Download of `trystero@0.26.0` | jsDelivr: your IP, the fact you opened Chat/Share |
| 3 public Nostr relays (chosen from Trystero's list of 29) | WSS, TCP 443 | Only while the room needs to be discoverable (see below) | Subscriptions to a topic derived from app + room ID; WebRTC offers/answers **encrypted** with a key derived from the link secret | Relay operators: your IP, timing, an opaque topic, ciphertext |
| `stun.l.google.com`, `stun1.l.google.com`, `stun2.l.google.com` | STUN, UDP 19302 | While a WebRTC connection is being set up | STUN binding requests (no content) | Google: your public IP:port |
| `stun.cloudflare.com` | STUN, UDP 3478 | While a WebRTC connection is being set up | STUN binding requests (no content) | Cloudflare: your public IP:port |
| The other peer | WebRTC: DTLS + SCTP over UDP, ephemeral ports chosen by the browser | During the session | Everything, encrypted twice (DTLS + AES-256-GCM) | The peer: your IP address(es) |
| Local network | mDNS, UDP 5353 | WebRTC on the same LAN | `.local` host-candidate resolution (the browser hides local IPs behind random mDNS names) | Devices on your LAN |

There are **no TURN relays**, so data never transits a third party. The trade-off is that two peers
behind strict symmetric NATs or UDP-blocking firewalls cannot connect.

### When are relay connections open?

Relays are only needed so that a **new** peer can find the room, so the app disconnects from them
(and pauses Trystero's automatic reconnection) as soon as that's no longer true:

| Peer | Connected to relays while… | Disconnects when… |
|---|---|---|
| Host | the room is open to new members | the room is locked, full, or closed |
| Guest | looking for the host | accepted by the host (reconnects only if the host drops, e.g. reloads) |

Trystero picks 3 of its 29 default relays with a shuffle seeded by the app ID, so all peers of the
same app pick the same 3. The list is in Trystero's source (`@trystero-p2p/nostr`, `defaultRelayUrls`).

## Cryptography: what is and isn't ours

**No cryptographic primitive is implemented in this project.** Every primitive comes from the
browser's Web Crypto API, which browsers implement natively (BoringSSL in Chrome, NSS in Firefox,
CoreCrypto in Safari):

| Purpose | Primitive |
|---|---|
| Randomness | `crypto.getRandomValues` |
| Encryption | AES-256-GCM, random 96-bit IV per message |
| Passphrase stretching | PBKDF2-HMAC-SHA-256, 600,000 iterations |
| Key derivation | HKDF-SHA-256 |
| Passphrase proof | HMAC-SHA-256 challenge-response |
| Identities / signatures | ECDSA P-256 with SHA-256, non-extractable private keys |
| Safety code | SHA-256 over both DTLS certificate fingerprints |
| Transport | WebRTC DTLS (browser-native) |

What **is** ours is the *protocol*: how these primitives are combined to authenticate the host,
prove the passphrase, approve members and authenticate messages. That's the part that deserves
review. It's specified in [PROTOCOL.md](PROTOCOL.md) and exercised by adversarial tests (forgery,
replay, impostor host, wrong passphrase, tampered files) in `tests/room.test.js`.

## Browser storage

| Store | What | Lifetime |
|---|---|---|
| IndexedDB `uss-hosts` | Chat host state for resuming after a reload: room ID, link secret, host identity (**non-extractable** private key), derived keys (non-extractable), approved members' public keys | Until the host closes the room, at most 24 h |
| sessionStorage | Chat: your nickname; host: the room passphrase, to show it again after a reload | Until the tab is closed |
| Web Locks | `uss-host:<app>:<room>` so only one tab acts as host | While the tab is open |

Secure Share stores nothing.

## Security headers and policies

- Content Security Policy (meta tag): `default-src 'none'`; scripts only from `'self'` and
  `https://cdn.jsdelivr.net`; `connect-src 'self' wss:`; no inline scripts or styles; no
  `object`, `base-uri` or form targets.
- `referrer` policy `no-referrer`.
- `tools/serve.py` (development) adds `X-Content-Type-Options: nosniff` and `Cache-Control: no-store`.
  Production hosts should send the same headers plus HSTS.
