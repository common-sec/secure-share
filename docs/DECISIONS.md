# Decisions

The decisions that shape the project, as they stand today. Each says what was decided, why, what
else was considered, and what would make us revisit it. New ideas go to [IDEAS.md](IDEAS.md); when
one changes a decision here, the entry is updated (never silently rewritten) and the old choice is
kept under "History".

**Status:** ✅ in force · 🔄 in force, under review · ⏭ superseded

---

## Architecture

### D1. No backend: a static site, everything runs in the browser ✅
- **Why:** nothing to store, so nothing to leak; nothing to operate or pay for; every line that runs is auditable.
- **Alternatives:** an app server with storage, like one-time-secret services.
- **Revisit if:** a feature truly needs server state, such as store-and-forward delivery ([IDEAS](IDEAS.md#store-and-forward-delivery)).

### D2. Data goes directly browser to browser over WebRTC ✅
- **Why:** no third party ever carries the content; WebRTC is built into every browser and encrypted with DTLS.
- **Alternatives:** uploading to a server or cloud storage (stores data); IPFS (data pinned on third-party nodes; rejected 2026-10-10).
- **Revisit if:** too many users can't connect directly (see D5).

### D3. Signaling through public Nostr relays, via Trystero 🔄
- **What:** browsers find each other by exchanging encrypted WebRTC "business cards" on 3 public
  Nostr relays, using Trystero's Nostr strategy. See [COMMUNICATION.md](COMMUNICATION.md).
- **Why:** no server of ours is needed; hundreds of independent, free relays mean no single
  operator or point of failure; Nostr's ephemeral events are made for throwaway messages; Trystero
  is small, MIT-licensed, and handles WebRTC setup, chunking and encryption of the cards.
- **Honest note:** Nostr was Trystero's default and was kept rather than chosen after a full
  comparison. Relays were built for social media, not for us, and owe us no uptime (rate limiting
  was seen in testing).
- **Alternatives:** BitTorrent WebSocket trackers (built for this, but few survive), public MQTT
  brokers (test brokers of a few companies), Firebase/Supabase (account, one company), our own
  signaling relay, manual copy-paste of the cards (no third party at all, but a poor user experience).
- **Revisit if / next step:** our own signaling relay is proposed ([IDEAS](IDEAS.md#own-signaling-relay)): reliability, a known operator, and no third party seeing IP addresses.

### D4. Use relays only while someone new needs to find the room ✅
- **What:** 3 relays instead of Trystero's default 5. The guest disconnects once accepted, the host
  when the room is locked or full, and Trystero's automatic reconnection is paused.
- **Why:** relays see IP addresses and timing; less exposure, fewer third parties.

### D5. No TURN relay ✅
- **Why:** no third party carries data, and there's zero cost. Direct connections work on most
  home, office and mobile networks (verified: iPhone on 5G against a computer on wifi).
- **Cost:** two peers both behind strict, symmetric NATs can't connect.
- **Revisit if:** users report failures ([IDEAS: Optional TURN relay](IDEAS.md#optional-turn-relay)). Data would stay end-to-end encrypted.

### D6. Chat is a star through the host ✅
- **Why:** guests never learn each other's IP addresses; only the host admits people; fewer connections.
- **Cost:** the room ends when the host leaves; the host is trusted for membership (see PROTOCOL §11).
- **Alternatives:** a full mesh, where everyone connects to everyone.

### D7. Share and Chat stay one app; Share is the home page ✅
- **Why:** both are the same story, sharing data securely and easily. Most people need to send one
  thing once. Libraries get extracted only if they're useful elsewhere.

## Security

### D8. Access needs the link and a passphrase, and the host approves (Chat) ✅
- **What:** the link carries a 256-bit secret after `#` (never sent to servers). The passphrase is
  shared separately. Chat hosts approve each guest after comparing safety codes.
- **Why:** a leaked link alone isn't enough; the passphrase can only be guessed online, against
  the host, which locks after 5 tries.

### D9. Nothing derived from the passphrase is ever visible to third parties ✅
- **What:** the key protecting the cards on the relays comes from the link secret only. The
  passphrase is proven by HMAC challenge-response inside the direct channel.
- **Why:** otherwise relays (or anyone recording them) could test passphrase guesses offline.

### D10. No hand-made crypto primitives: Web Crypto only ✅
- **What:** AES-256-GCM, ECDSA P-256, HKDF, PBKDF2 (600k), HMAC, SHA-256 and the CSPRNG, all from
  the browser. Our own code is the protocol that combines them, specified in PROTOCOL.md and
  covered by attack tests.
- **Alternatives considered for later:** PAKE, Noise, the `age` format for Share, MLS for group chat ([IDEAS](IDEAS.md)).

### D11. Safety codes from both DTLS certificates ✅
- **Why:** a man-in-the-middle would hold different certificates on each side, so the codes
  wouldn't match. Comparing them out of band detects it.

## Engineering

### D12. Strict TypeScript with a reproducible build ✅ (0.6.0)
- **What:** TypeScript (strict) built by esbuild into `dist/`. Building the same source twice gives
  byte-identical files, and every release publishes their checksums.
- **Why:** types catch mistakes in the protocol code; reproducibility keeps "served code =
  reviewed code" verifiable now that there is a build step.
- **Before:** plain JavaScript with no build step (0.1.0 to 0.5.0).

### D13. One runtime dependency, bundled from a lockfile ✅ (0.6.0)
- **What:** `trystero@0.26.0` from npm, locked with integrity hashes and bundled into the app. The
  CSP allows scripts only from `'self'`.
- **Why:** no third party serves code at runtime.
- **Before:** loaded from jsDelivr at a pinned URL.

### D14. All development, tests and scans in containers ✅
- **What:** pinned images (tag + digest), non-root, no capabilities, read-only filesystems, tests
  without network. Docker in WSL with the root daemon (rootless proposed).
- **Why:** a compromised dependency can only reach the project folder.

### D15. Supply-chain rules: pin everything, 7-day minimum age ✅
- **What:** images by digest, actions by SHA, Python packages by hash; `.npmrc` (`ignore-scripts`,
  `min-release-age=7`) and `pip.conf` (`require-hashes`, wheels only, `uploaded-prior-to=P7D`);
  Dependabot with a 7-day cooldown.
- **Why:** most malicious releases are caught within days; nothing runs install scripts.

### D16. Tests run in real browsers, driven by Playwright ✅
- **What:** unit tests run inside the page (Web Crypto, WebRTC and IndexedDB are real);
  end-to-end tests drive real UIs over real WebRTC, with a local test Nostr relay, plus an
  optional run against the public relays.
- **Why:** mocking browser crypto and networking would test the mocks.

### D17. Secret scanning with TruffleHog, static analysis with Semgrep, dependencies and config with Trivy ✅
- **What:** each in its own pinned container, in CI on every push. TruffleHog runs offline with no
  verification calls, so found secrets are never sent anywhere.
- **History:** Gitleaks (0.3.0) was replaced by TruffleHog (0.3.1). Project-specific static checks
  were removed in 0.3.1; ongoing tracking is planned as posture management.

## Project

### D18. One roadmap item at a time; each is a version ✅
- **What:** [ROADMAP.md](ROADMAP.md) drives the work, [IDEAS.md](IDEAS.md) feeds it, every
  iteration ends with a commit, and every finished item with a tag.

### D19. Public on GitHub, served by GitHub Pages ✅
- **Why:** truly free and simple. The repository must be public anyway for free Pages, and to be audited.
- **Cost:** no visitor statistics; no custom security headers (CSP comes from a `<meta>` tag).
- **Revisit:** at the 1.0.0 hosting decision ([IDEAS: Hosting](IDEAS.md#hosting-github-pages-and-alternatives)).

### D20. Privacy by default, not anonymity ✅
- **What:** no third-party scripts, no cookies, no tracking. The goal is easy secure sharing, not
  untraceable communication. IP addresses are visible to peers, relays and STUN servers by nature.

### Open
- **License:** pending the owner's review. Until chosen, the published code is "all rights reserved".
