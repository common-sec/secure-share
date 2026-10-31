# Threat model

## What we protect

| Asset | Example |
|---|---|
| **Content** | Shared text, files, chat messages |
| **Credentials** | Generated passwords and passphrases, the room passphrase, the link secret |
| **Integrity and authenticity** | "This message really came from Bob, unmodified" |
| **Access** | Only people the sender or host intends can get the data |
| **Metadata** (best effort) | Who talks to whom, IP addresses, that a room exists |

## Trust assumptions

- The user's **device, OS and browser** are not compromised. Malicious browser extensions are out of scope.
- The **code served** is the code in this repository plus the pinned Trystero version (see supply chain below).
- The **out-of-band channel** used to share the passphrase is different from the one used for the link.
- **Web Crypto** implementations are correct.

## Adversaries and mitigations

### 1. Network observer (Wi-Fi, ISP, backbone)
- **Sees:** that you connect to the static host, Nostr relays, STUN servers and a peer IP; timing and volume.
- **Cannot:** read or modify content. Everything is TLS, WSS or DTLS, and the app adds AES-256-GCM on top.
- **Residual:** traffic analysis. File sizes are approximately visible.

### 2. Nostr relay operators (third parties used for discovery)
- **See:** your IP, connection times, an opaque topic derived from the app and room ID, and offers encrypted under the link-derived key.
- **Cannot:** read offers without the link secret, read data (it never passes through them), or test passphrase guesses offline, because nothing on the relay depends on the passphrase.
- **Mitigation:** only 3 relays, and they are disconnected as soon as the room doesn't need discovery (guest accepted, room locked or full).
- **Residual:** they can correlate the peers that use the same topic at the same time, i.e. *who talked to whom*. They can also refuse service (denial of service).

### 3. STUN server operators (Google, Cloudflare)
- **See:** your public IP:port while a connection is being set up.
- **Cannot:** see content, room IDs or peers.

### 4. Someone who obtains the link (but not the passphrase)
- **Cannot:** join. The guest must prove the passphrase to the host by HMAC challenge-response, and the host must also approve them in Chat.
- **Cannot:** brute-force the passphrase offline. Every guess is an online attempt, and after 5 the room locks.
- **Can:** lock the room (denial of service) and learn that it exists.

### 5. Someone who obtains the link **and** the passphrase
- Chat: still needs the **host's approval**, and the host sees their nickname and safety code.
- Share: receives the payload if they connect before the intended recipient. **Mitigations:** the sender can enable "Ask me before delivering"; and once delivered, the real recipient finds the link dead, which signals the leak.
- **Cannot** impersonate the host: that requires the host's private key, which never leaves the host's browser.

### 6. Man-in-the-middle on the connection
- Would need to decrypt Trystero's signaling (needs the link secret) and then terminate DTLS with each side.
- **Detected** by comparing the safety code (derived from both DTLS certificates) out of band.
- **Residual:** users who don't compare codes rely on the secrecy of the link.

### 7. A malicious member (approved guest)
- Can read the room's content (by definition) and see the host's IP.
- **Cannot:** forge messages as another member (ECDSA signatures checked against the roster), replay messages (per-session ID set), send altered files (signed SHA-256), learn other guests' IPs (star topology), or reach other guests directly.

### 8. A malicious host
- Can read everything, drop messages, and see every member's IP.
- **Can** swap the roster's key for another member's nickname, impersonating them to others. Members can only verify the host, not each other. See [PROTOCOL.md §11](PROTOCOL.md).
- **Cannot** forge messages signed by a key it doesn't hold.

### 9. Supply chain: the static host, the npm packages, the build
- **This is the most important residual risk.** Whoever controls the served JavaScript controls the app.
- **Mitigations:**
  - four runtime dependencies (Trystero, with two small dependencies of its own,
    qrcode-generator, openpgp.js and client-zip, with none), each loaded only on the pages that use it, and two build tools
    (TypeScript, esbuild), at exact versions locked with integrity hashes in `package-lock.json`,
    installed with `npm ci`, no install scripts, and only releases at least 7 days old;
  - everything is **bundled at build time**: no CDN, and the CSP lets scripts load only from `'self'`;
  - the build is **reproducible**: anyone can rebuild a release tag and compare its checksums
    with the published `SHA256SUMS` and with the files actually served ([RELEASES.md](RELEASES.md));
  - the footer shows which build is running (version + commit).
- **Remaining:** the static host (GitHub Pages) could still serve different files. Comparing the
  served files with a release's checksums detects it, and running a verified release locally
  avoids it. Serve with HSTS in production.

### 10. Cross-site scripting and injection
- All user and peer content is rendered with text nodes, never `innerHTML`. CI enforces this.
- The CSP forbids inline scripts and styles, `eval`, plugins and foreign form targets.
- Received file names are sanitized. Files are offered as downloads (`application/octet-stream`), never rendered.

### 11. Someone with later access to the device
- Share stores nothing.
- Chat hosts keep the room state (link secret, non-extractable keys) in IndexedDB **only to
  survive a reload**: the open page refreshes it every 30 s, a record not refreshed for 2 minutes
  (a closed tab) is refused and deleted, and so is one past the room's time limit. Closing the
  room deletes it at once. The passphrase is never stored; sessionStorage holds only the nickname.
  Why not store nothing: [D22](DECISIONS.md#d22-a-chat-hosts-room-survives-a-reload-not-a-closed-tab-).
- Every room closes on its own after a time limit (default 4 hours, at most 24, chosen by the
  host), for the host and every guest, so a forgotten tab doesn't keep relay and peer connections
  open (and exposed to bugs in the code or the browser) indefinitely.
- **Residual:** while a room is open, script running in the page (an XSS, a browser bug) can use
  the stored keys, as it could use the ones in memory. Encrypting the record with another key
  kept in the same origin wouldn't change that, so we keep the record small and short-lived
  instead.
- Passphrase fields aren't password fields, so browsers don't offer to save them in their
  password manager (Firefox, which lacks the masking used, may still offer).
- **Residual:** browser history contains room links (the fragment includes the link secret). The
  clipboard and OS clipboard history may retain copied secrets.

## Encrypted files

The files page (`/files/`, decision D25) protects files **at rest** (cloud storage, a USB stick,
a backup): whoever gets the encrypted file but not the password learns nothing but its size.
**Harvest now, open later:** a copy of the file that travels through channels we don't control
(email, chat apps) can be kept and attacked whenever passwords get cheaper to guess or a weakness
in the format is found. So the page steers sending towards Secure Share and Chat, which leave no
copy behind, and doesn't suggest emailing encrypted files.

- **Offline guessing is possible**, unlike with rooms: anyone with the file can try passwords as
  fast as their hardware allows. Mitigations: the strongest S2K OpenPGP's iterated format allows
  (65,011,712 bytes of SHA-256 per guess, about 2^20 SHA-256 blocks), suggested passwords of
  six random words (about 59 bits, so roughly 2^78 SHA-256 blocks for an even chance), and a warning
  when a typed password is estimated below 50 bits. The S2K isn't memory-hard (Argon2 is in RFC
  9580, which GnuPG 2.4 can't read), so a weak password stays weak.
- **Integrity:** the MDC (SHA-1 over the plaintext, inside the encryption) detects a modified or
  cut-off file. Decryption streams, so the page releases nothing until the whole file has passed;
  a failure offers no download and says the file was damaged or changed, or the password isn't
  exactly right: about 1 time in 128, a wrong password gets past the session key and only fails
  here.
- **Crypto:** AES-256-CFB with the MDC is older than AEAD but sound for this use; there's no
  oracle to query, since nobody decrypts for an attacker. Symmetric encryption with 256-bit keys
  isn't threatened by quantum computers.
- **Metadata:** the file name is stored inside the encryption (gpg can restore it); the size is
  not hidden. A package's paths are inside the encrypted ZIP.
- **Untrusted files:** decrypted names are reduced to their last part and stripped of
  characters file systems reject; ZIP paths written by the page can't contain `..` or absolute
  paths. Decrypted files are offered as downloads, never rendered.
- **Residual:** while the page is open, decrypted content is in memory or in the browser's Blob
  storage (possibly temporary files on disk); downloads are plaintext on disk; a lost password
  can't be recovered.

## Non-goals

- **Anonymity.** WebRTC reveals IP addresses to peers, and relays and STUN servers see IPs. Use a
  VPN if that matters. Tor doesn't support WebRTC.
- **Long-term storage, offline delivery, or many-to-many scale.** The sender or host must stay online.
- **Protection against a compromised endpoint** (malware, malicious extensions, screen capture).

## Password generator

- Randomness: `crypto.getRandomValues` with rejection sampling, so there is no modulo bias (tested with chi-squared).
- The strength shown is the entropy of the generator's own random choices, assuming the attacker
  knows the generator, word list and settings. It's the exact Shannon entropy of each word slot,
  minus a 1-bit safety margin, never an estimate based on length.
- Settings may be put in the URL, but passwords never are. Nothing is sent anywhere.
