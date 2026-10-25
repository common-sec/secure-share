# Protocol specification (v3)

This is the protocol implemented by `SecureRoom` in `src/lib/room.ts`, with primitives from
`src/lib/crypto.ts`. All primitives are Web Crypto, except files and Share text, which are
[age v1](https://age-encryption.org/v1) files (§7). Encodings: `b64u` = base64url without padding,
UTF-8 for strings, `‖` = byte concatenation, `|` = the literal character `|` in a string.

## 1. Identifiers and the room link

| Name | Definition |
|---|---|
| `roomId` | 16 random bytes, `b64u` (22 chars) |
| `secret` | 32 random bytes, `b64u` (43 chars), the *link secret* |
| identity | ECDSA P-256 key pair, generated per session; private key non-extractable |
| `pub` | `b64u(raw public key)`, the 65-byte uncompressed point |
| `fp` | `b64u(SHA-256(raw public key))` |
| `memberId` | first 16 characters of `fp` |
| `h` | the host's `fp` |

Link: `https://<origin>/#/<chat|share>?r=<roomId>&k=<secret>&h=<h>`. Everything after `#` stays in
the browser. The **passphrase** is shared out of band and is never part of the link.

## 2. Key derivation

```
signaling = HKDF-SHA-256(ikm = secret, salt = "uss/v2/" + roomId, info = "signaling", 256 bits)
pw        = PBKDF2-HMAC-SHA-256(NFKC(passphrase), salt = "uss/v2/" + roomId, 600 000 iterations, 256 bits)
base      = secret ‖ pw
groupKey  = HKDF-SHA-256(ikm = base, salt = "uss/v2/" + roomId, info = "group") → AES-256-GCM key
authKey   = HKDF-SHA-256(ikm = base, salt = "uss/v2/" + roomId, info = "auth")  → HMAC-SHA-256 key
ageKey    = HKDF-SHA-256(ikm = base, salt = "uss/v2/" + roomId, info = "age")   → HMAC-SHA-256 key
ageSeed   = HMAC-SHA-256(ageKey, "uss-age-identity")                             32 bytes
ageIdentity  = bech32("AGE-SECRET-KEY-PQ-", ageSeed), upper case                age hybrid identity
ageRecipient = its age1pq1… recipient (ML-KEM-768 + X25519, "mlkem768x25519")
```

The KDF labels keep `uss/v2/`: v3 changes the payload format, not the derivation of v2's keys.

- `b64u(signaling)` is given to Trystero as its room `password`. Trystero encrypts every published
  WebRTC offer/answer with `AES-GCM(SHA-256(password ":" appId ":" roomId))`.
- **`signaling` does not depend on the passphrase.** Anything derived from the passphrase and
  visible to third parties (relays) would let them test passphrase guesses offline.
- All derived keys are non-extractable `CryptoKey`s. `ageSeed` and `ageIdentity` are computed
  from `ageKey` when first needed and kept in memory for the page's lifetime (the age library takes
  the identity as a string); they're never stored, and only `ageKey` goes into the host's saved
  state (§9).
- **The age identity needs the link and the passphrase**, like `groupKey`, and is post-quantum: a
  recording of the traffic can't be decrypted later by breaking X25519 alone.

## 3. Discovery and transport

- Trystero `appId` = `"commonsec-share.<app>.v3"`, `<app>` ∈ {`chat`, `share`}. The `appId`
  decides which relays peers meet on and must match on both sides, so it changes only with the
  protocol version: v2 (`user-sec-tools.<app>.v2`, the project's original name) and v3 pages never
  meet. Strategy: Nostr,
  `relayConfig.redundancy = 3`, `manualReconnection = true`.
- WebRTC data channels (DTLS + SCTP) carry everything below. Trystero's `onPeerHandshake` hook
  runs the handshake (§4) on a dedicated channel **before** the peer becomes active. A peer whose
  handshake fails on either side is never connected.
- Discovery is turned off (relay sockets closed, reconnection paused) when not needed:
  - host: off while `locked` or `guests ≥ maxGuests`;
  - guest: off once accepted; back on if the host disconnects.

## 4. Handshake

Messages are JSON objects. `nonceH`, `nonceG` are 16 random bytes, `b64u`.

```
Host  → Guest   { v: 3, role: "host",  pub: pubH, nonce: nonceH }
Guest → Host    { v: 3, role: "guest", pub: pubG, nonce: nonceG, nick }

Guest:  if role ≠ "host" or b64u(SHA-256(pubH)) ≠ h  → abort ("not-host")
        (this also makes guests refuse each other)

Host  → Guest   { sig: ECDSA-SHA-256(privH, "uss-host|" + nonceG + "|" + nonceH) }
Guest → Host    { proof: HMAC-SHA-256(authKey, "uss-join|" + nonceH + "|" + nonceG + "|" + pubG + "|" + nick) }

Guest:  verify sig with pubH, else abort ("not-host")

Host:   if locked or pubG banned                → reason "locked"
        if proof invalid                        → failures += 1; if failures ≥ 5: lock; reason "passphrase"
        if clean(nick) empty                    → reason "nick"
        if guests ≥ maxGuests                   → reason "full"
        if nick already used (case-insensitive) → reason "nick-taken"
Host  → Guest   { ok: true }   or   { ok: false, reason }
```

Properties:
- **Host authentication.** Only the holder of `privH` can sign over the guest's fresh `nonceG`.
- **Passphrase proof without an offline oracle.** Nothing the host sends depends on the
  passphrase, so a guest who doesn't know it learns nothing except "wrong". Each guess is an
  online attempt that the host counts. The room locks after 5.
- **Fields are unambiguous.** Only `nick`, the last field, may contain `|`. Nonces and `pub` are base64url.
- `clean(nick)` strips control characters, collapses whitespace, trims, and caps at 32 characters.

## 5. Admission

After a successful handshake the guest is *pending*:
- Chat: the host UI asks for approval and shows the pairwise **safety code** (§8). Share:
  auto-accept unless the sender enabled approval.
- A guest whose `pubG` **and** nickname match a previously approved member is re-admitted
  automatically. This is how members reconnect after a host reload.
- Pending guests receive nothing.

On accept the host sends `welcome` with the time left before the room closes, then broadcasts
the roster. On decline or removal it sends
`bye` and closes the connection. The guest's key is banned for the rest of the session.

## 6. Control messages (host → guest)

`ctl = b64u(seal(groupKey, UTF-8(JSON)))`, accepted by a guest only from the host's connection:

```
{ t: "welcome", ttl?: ms }                                 // ttl: time left, 0 < ttl ≤ 24 h, else ignored
{ t: "roster", members: [ { id, nick, pub, host } ] }     // guest checks that the host entry's pub is pubH
{ t: "bye", reason: "rejected" | "kicked" | "closed" | "expired" }
```

**Time limit.** The host picks a lifetime when creating the room (default 4 h, capped at 24 h).
At the end it sends `bye {reason: "expired"}` to every guest and closes. A guest that received a
`ttl` closes on its own when it runs out, even if the host is gone. Both warn 10 minutes before.
`ttl` is relative, so the two clocks needn't agree. Older guests ignore `ttl` and read `expired`
as `closed`.

```
```

## 7. Messages and files

**Envelope** (any sender):

```
inner  = { t, …fields, id: b64u(12 random bytes), from: memberId, ts: milliseconds }
d      = JSON.stringify(inner)
s      = b64u(ECDSA-SHA-256(privSender, UTF-8(d)))
packet = b64u(seal(groupKey, UTF-8(JSON.stringify({ d, s }))))
seal(k, m) = iv ‖ AES-256-GCM(k, iv, m)      iv = 12 random bytes, 128-bit tag
```

Message types: `text {body ≤ 100 000 chars}`; Share uses `manifest {text?, files: [{name, size}]}`
and `ack {}`, where `text = b64u(ageEncrypt(UTF-8(text)))` (≤ 100 000 chars once decrypted). A
manifest whose `text` doesn't decrypt is ignored. Chat messages stay in the envelope alone (see
[D23](DECISIONS.md)).

**Receiving**:
1. The sending connection must be trusted: for the host, a member's connection; for a guest, the
   host's connection after `welcome`.
2. Decrypt with `groupKey`. Any failure means the packet is dropped.
3. `member = roster[inner.from]`. Verify `s` over `d` with `member.pub`, or drop.
4. Host only: `member` must be the member attached to the sending connection, so members can't
   inject packets attributed to others even with a valid signature.
5. Drop if `inner.id` was already seen (replay protection for the session).
6. Host only: forward the identical `packet` to all other members.

**Files**: `data = ageEncrypt(bytes)`, with metadata `{ m: packet }` where `inner = { t: "file",
name, size, type, sha256: b64u(SHA-256(bytes)) }`. The receiver applies the same checks, decrypts
`data` with `ageIdentity` only, and checks `len(bytes) = size` and the SHA-256. Maximum 512 MiB,
held in memory.

**age**: `ageEncrypt(m)` is an age v1 file with exactly one `mlkem768x25519` stanza, to
`ageRecipient`: a fresh 16-byte file key, a header MAC, then the payload in 64 KiB
ChaCha20-Poly1305 chunks (STREAM), the last one marked final. Decryption uses `ageIdentity` and
nothing else, so passphrase (scrypt) files and files for other recipients fail; tampered,
truncated or extended files fail too. Anyone holding `ageIdentity` can decrypt such a file with the
reference tool: `age -d -i key.txt file.age` (age ≥ 1.3). The overhead is under 4 KiB plus 16 bytes
per chunk.

## 8. Safety code

Each side reads the DTLS certificate fingerprints from the local and remote SDP
(`a=fingerprint:<alg> <hex>`, normalized to lowercase algorithm and uppercase hex), sorts the two
strings, and computes:

```
code = decimal( first 8 bytes of SHA-256(fpA + "|" + fpB) as big-endian integer  mod 10^12 ), 12 digits
```

Both ends of a direct connection compute the same code. A man-in-the-middle terminates DTLS
separately with each side, which produces different codes. Users compare codes out of band. Codes
are **pairwise between host and guest**: guests can't compare codes with each other.

## 9. Host resume (Chat)

The host stores `{roomId, secret, h, nick, identity, keys, approved, expiresAt}` in IndexedDB,
where the private key and the derived keys are non-extractable `CryptoKey`s. The page re-saves it
every 30 s and when it's hidden or unloaded. Opening the room link again in the same browser
resumes hosting if the record exists, `h` matches, it was saved less than 2 minutes ago (so a
reload, not a tab closed earlier), the room's time limit hasn't passed, and no other tab holds the
Web Lock `uss-host:chat:<roomId>`. Records failing those checks are deleted, and every visit to
Chat sweeps them. A resumed room keeps its original `expiresAt`. Closing the room deletes the
record. Guests
treat a vanished host as `host-lost`, search again, and are re-admitted per §5.

## 10. Limits and constants

| Constant | Value |
|---|---|
| PBKDF2 iterations | 600,000 |
| Max guests | Chat 7, Share 1 |
| Wrong-passphrase attempts before auto-lock | 5 |
| Handshake timeout | 15 s |
| Max file | 512 MiB (plus the age overhead on the wire) |
| Max text | 100,000 characters |
| Relays | 3 (Trystero default list, seeded shuffle) |

## 11. Known limitations (by design or not yet addressed)

- **The host is trusted for membership.** It publishes the roster that binds nicknames to keys,
  so a malicious host could swap in its own key under another member's nickname. The host can
  already read everything, but it can't forge the signature of a key it doesn't hold.
- **There's no application-level forward secrecy.** `groupKey` and the age identity are fixed for the room's lifetime.
  Recorded traffic is still protected by DTLS (ephemeral ECDHE), but anyone who later obtains the
  link and the passphrase **and** can see application-layer data could decrypt it.
- **The handshake isn't bound to the DTLS channel.** Interposing on it would require decrypting
  Trystero's signaling, which needs the link secret. A safety-code comparison detects it either way.
- **Replay protection** is per session, using an in-memory set of message IDs. `ts` isn't validated.
- **Signatures are classical** (ECDSA P-256). A quantum computer could forge them only during a live
  session, not from a recording; ML-DSA can replace them once browsers' Web Crypto offers it.
- **Anyone with the link can lock the room** by sending 5 wrong passphrases (denial of service).
