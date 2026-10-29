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

### D5. No TURN relay (for now) 🔄
- **Why:** no third party carries data, and there's zero cost. Direct connections work on most
  home, office and mobile networks (verified in a real-world test across two different networks, mobile data and wifi).
- **Cost:** two peers both behind strict, symmetric NATs can't connect.
- **Next:** roadmap 0.10.0 adds an end-to-end encrypted relay fallback, used only when no direct path works ([ROADMAP.md](ROADMAP.md)). Clear failure messages came first, as fix N1 (2026-10-25).

### D6. Chat is a star through the host ✅
- **Why:** guests never learn each other's IP addresses; only the host admits people; fewer connections.
- **Cost:** the room ends when the host leaves; the host is trusted for membership (see PROTOCOL §11).
- **Alternatives:** a full mesh, where everyone connects to everyone.

### D24. One static page per tool, JavaScript enhances ✅ (2026-10-29)
- **What:** the build (`pages.mjs`, called by `build.mjs`) pre-renders one HTML page per tool
  (`/`, `/chat/`, `/passwords/`) and per content page (`/how-it-works/`, `/faq/`), from a shared
  layout and per-page content in `src/pages/`. Each tool's page has its heading, introduction and
  metadata in the HTML; `app.js` mounts the tool into it. Room secrets and settings stay in the
  fragment: `/#r=…&k=…&h=…` for Share, `/chat/#r=…` for Chat. Old `/#/chat?r=…` links are
  redirected in JavaScript.
- **Why:** crawlers and link previews saw an empty page and a single URL. Static content gives
  each tool its own indexable address and a trustworthy preview that never contains the secret
  (previews don't receive the fragment).
- **How:** option A of the [static site assessment](reviews/2026-10-13-static-site-generation.md):
  no new dependency, the same reproducible build and `SHA256SUMS`, plain `{{placeholder}}`
  templating. Relative links throughout, so the site works from a subfolder; only canonical and
  preview URLs use the public address (`$BUILD_SITE_URL`).
- **Revisit:** if content grows a lot (translations, many pages), move the pages to Hugo from a
  pinned container (option C).

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
- **Alternatives considered for later:** PAKE, Noise, MLS for group chat ([IDEAS](IDEAS.md)). The
  `age` format was considered and dropped (D23).

### D23. The `age` format: considered and dropped, for now ❌ (2026-10-25)
- **What was proposed:** the roadmap (0.8.0, then 0.9.0 once guided sharing moved ahead)
  planned to encrypt Share payloads (files and text) in the [age](https://age-encryption.org)
  format, with the `age-encryption` library. It was built and
  tested (closed PR #26): a post-quantum hybrid age identity derived from the room keys,
  interoperable with the reference `age` tool, all tests green.
- **Why it was dropped:** age is a file format, not a channel protocol. Chat messages, control
  messages, the handshake, the passphrase proof and key derivation stayed our own design, and age
  sat next to them inside the same channel, so there was more to review, not less. It also has no
  sender authentication or forward secrecy, and costs about 1.6 KB per message, so it doesn't fit
  chat. The goal is that the **whole channel** uses a reviewed construction.
- **Next:** roadmap 0.9.0 is now a standard secure channel; the study compares Noise (`IK` with a
  pre-shared key, on the snow library), binding our handshake to WebRTC's DTLS, PAKE (CPace), MLS
  and HPKE.
- **Revisit:** age (or HPKE) for data that leaves the live channel: a saved encrypted file, or
  payloads through the 0.9.0 relay fallback.

### D11. Safety codes from both DTLS certificates ✅
- **Why:** a man-in-the-middle would hold different certificates on each side, so the codes
  wouldn't match. Comparing them out of band detects it.

### D22. A chat host's room survives a reload, not a closed tab 🔄
- **What:** the host's room state (link secret, non-extractable keys, approved members) is kept
  in IndexedDB only so a reload can resume the room. The open page re-saves it every 30 s and when
  hidden or unloaded; a copy not refreshed for 2 minutes, or past the room's time limit, is
  refused and deleted, and Chat sweeps stale copies on every visit. The passphrase is never
  stored. Every room also closes on its own after a time limit (4 h by default, 1 to 24 h).
- **Why:** phones reload background tabs without warning, and losing the room then means sending
  a new link and passphrase to everyone. Keeping the state for a reload only limits the window
  in which a stolen copy is usable to about 2 minutes after the tab closes.
- **Alternatives:** (1) no resume at all, nothing stored, with a warning before a reload: safest
  and simplest, but the browser's "Leave site?" prompt can't be customised, doesn't tell a reload
  from a close, and never shows when a phone reloads a background tab. (2) sessionStorage: it only
  holds text, so the keys would have to be exportable and written out in clear, which is worse.
  (3) Encrypting the IndexedDB copy with another key in the same origin: script in the page could
  use that key as easily, so it adds nothing.
- **Revisit:** after the no-resume trial ([roadmap fix K4](ROADMAP.md#high-priority-security-findings)):
  if rooms stay usable on phones and computers with clearer warnings, drop resume.

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
- **Since 0.8.0:** a second one, `qrcode-generator@2.0.4` (MIT, no dependencies), for the QR code
  of the Share link (roadmap G3), under the same rules: locked, bundled, loaded lazily from
  `src/vendor/qrcode.ts`, and only used to compute the grid (the SVG is drawn by our code).

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
- **Since 2026-10-19:** the roadmap holds only app features and user-facing fixes; platform,
  build, CI/CD and security process work is in [TODO.md](TODO.md) and ships in the next release
  without a feature version of its own. Both are files edited through pull requests, not GitHub
  Issues or Projects, so text from outside contributors never becomes the plan unreviewed
  ([TODO.md](TODO.md#why-a-file-in-the-repository-not-github-issues-or-projects)).

### D19. Public on GitHub, served by GitHub Pages ✅
- **Why:** truly free and simple. The repository must be public anyway for free Pages, and to be audited.
- **Cost:** no visitor statistics; no custom security headers (CSP comes from a `<meta>` tag).
- **Where:** https://share.common-sec.org/ (since 2026-10-15), a custom domain on the `common-sec`
  organisation's Pages. DNS: `share` is a CNAME to `common-sec.github.io`; `common-sec.org` is a
  verified domain of the organisation (so no one else can claim its subdomains on GitHub Pages);
  HTTPS is enforced. The older `common-sec.github.io/secure-share/` address redirects there.
- **Revisit:** at the hosting decision before 1.0.0 ([TODO I5](TODO.md#i5-production-hosting-and-headers)) ([IDEAS: Hosting](IDEAS.md#hosting-github-pages-and-alternatives)).

### D20. Privacy by default, not anonymity ✅
- **What:** no third-party scripts, no cookies, no tracking. The goal is easy secure sharing, not
  untraceable communication. IP addresses are visible to peers, relays and STUN servers by nature.

### D21. Names: CommonSec (organisation) and CommonSec Share (this app) ✅
- **What:** the organisation is **CommonSec** (GitHub `common-sec`, domain `common-sec.org`): an
  umbrella for practical security tools, templates and guides, with an open research-lab and
  community side. This app is **CommonSec Share** (repository `common-sec/secure-share`); its
  tools keep descriptive headings (Secure Share, Secure Chat, Password Generator).
- **Why:** one umbrella brand to build instead of one per tool; descriptive names say what each
  tool does and help search. The hyphenated domain is easier to read and makes lookalike domains
  easier to spot; the unhyphenated `commonsec.org` is worth owning as a redirect.
- **Not renamed:** the protocol's Trystero `appId` (`user-sec-tools.<app>.v2`), since changing it
  would split peers between old and new pages ([PROTOCOL.md](PROTOCOL.md)).
- **Done:** the app is served at `https://share.common-sec.org/` (2026-10-15). **Next:** logo.

### Open
- **License:** pending the owner's review. Until chosen, the published code is "all rights reserved".
