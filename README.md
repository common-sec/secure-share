# User Sec Tools

Small client-side security tools in a single static page app. There is no backend and no build step. The only
third-party dependency is [Trystero](https://github.com/dmotz/trystero) (WebRTC signaling), and everything
cryptographic uses the browser's native Web Crypto API.

## Tools

### Password generator (`#/password`)
- **Passphrase mode (default):** easy to remember, but never just dictionary words.
  - Default style mixes real words with *modified* words: common words with one small, sayable change
    (`cactus → Kaktus`, `lemon → Lemmon`, `rocket → Rocketix`). There is always at least one modified word,
    and a modification that happens to spell a listed word is discarded.
  - Other styles: modified words only, *blends* (gar·den + pick·le → `garle`), *invented* pronounceable words.
  - Capitals and a number are on by default, e.g. `Karrot-Stone57-Pencilo-Quail`.
- **Random characters mode:** sets, custom symbols, look-alike exclusion, and at least one character from each set.
- Uses `crypto.getRandomValues` with rejection sampling, so there is no modulo bias. Strength is the
  entropy of the generator's actual choices. For blends it is measured over the real output distribution, so it is
  never overstated.
- Settings are saved in the URL (`#/password?w=5&cap=random`). Passwords never go in the URL.

### Secure Chat (`#/chat`)
Group chat with file sharing. The host approves every member. The room link stays in the address bar. If the host
reloads, the room resumes and approved members reconnect automatically. The host's non-extractable keys are kept in
IndexedDB until the room is closed, for at most 24 h. A Web Lock ensures only one tab can act as host. Message
history is not kept.

### Secure Share (`#/share`)
One-way, one-time delivery of text and/or files, like onetimesecret but with no server storage. The sender's tab
stays open until the recipient has received everything, then the room closes and the link stops working.

## Security model (Chat and Share)

```
link:  #/<tool>?r=<room id>&k=<256-bit link secret>&h=<host key fingerprint>   (fragment: never sent to servers)
passphrase: shared separately (auto-generated, editable)

link secret                          --HKDF-->  Trystero signaling password (encrypts offers on public relays)
link secret + PBKDF2(passphrase)     --HKDF-->  group key (AES-256-GCM)  +  auth key (HMAC)
```

- **Discovery and NAT traversal:** Trystero publishes encrypted WebRTC offers on public Nostr relays, and ICE/STUN
  punch through NATs. Data then flows directly over WebRTC (DTLS). No TURN relay is used.
- **Star topology:** guests connect only to the host, who relays. Guests never learn each other's IP addresses.
- **The host can't be impersonated:** the host signs each guest's nonce with an ECDSA key whose fingerprint is in
  the link.
- **The passphrase can only be guessed online:** guests prove it with an HMAC challenge-response, and nothing
  derived from it is published or sent before the guest proves it. Every wrong attempt is reported to the host, and
  the room locks after 5.
- **Approval:** the host sees "*name* wants to join · safety code …" and accepts or declines. A declined guest is
  banned for the rest of the session.
- **Safety codes:** derived from both ends' DTLS certificate fingerprints. Matching codes, compared over a call or in
  person, rule out a man-in-the-middle.
- **Messages and files:** encrypted with the group key and signed with the sender's per-session ECDSA key. The
  host publishes the roster (nickname ↔ key), so members, including the relaying host, can't forge each other's
  messages. Files are also checked against a signed SHA-256 hash.

Limits: files are capped at 512 MB and held in memory. Groups are capped at 8 people. Peers that are both behind
strict symmetric NATs may not connect. The room ends when the host closes the tab.

## Run locally

Web Crypto needs a secure context (HTTPS or `localhost`).

```bash
python tools/serve.py 8080
```

Any static host (GitHub Pages, Cloudflare Pages, Netlify) works for deployment.

## Layout

```
index.html               shell + CSP
assets/styles.css
src/main.js              hash router
src/lib/random.js        unbiased CSPRNG helpers
src/lib/passphrase.js    blended / invented word generator (+ words.js raw material)
src/lib/crypto.js        key derivation, AES-GCM, ECDSA, HMAC proofs, safety codes
src/lib/room.js          SecureRoom: handshake, approvals, signed relay, files
src/lib/hoststore.js     resume hosting after a reload (IndexedDB + Web Locks)
src/tools/               home, password, chat, share UIs
src/vendor/trystero.js   the single, version-pinned third-party import
```
