# Roadmap

The roadmap lists what users get: **app features** and **user-facing fixes**. Platform, build,
CI/CD, testing infrastructure and security process work is tracked separately, in the internal
[TODO.md](TODO.md). Ideas start in [IDEAS.md](IDEAS.md) and only move here once chosen.

## How it works

1. **Idea → roadmap.** An idea in [IDEAS.md](IDEAS.md) is accepted, given a version and added below as *Planned*.
2. **One feature in progress.** The top *Planned* feature becomes *In progress* only when the previous one is *Done*.
3. **Iteration = commit.** Every iteration ends with a commit whose message says what changed and
   why. Tests must pass locally and in CI before an item is marked *Done*.
4. **Release.** When a feature is done: update [CHANGELOG.md](../CHANGELOG.md), mark it *Done*, and tag `vX.Y.Z`.
5. **Fixes and small improvements** that don't need a feature of their own are listed
   [below](#fixes-and-small-improvements), by priority. They're done between features and
   released as patch versions.
6. **Internal work** ([TODO.md](TODO.md)) doesn't get a feature version of its own: it ships in
   the next release, usually a patch. Some of it gates a release (for example, the
   [pre-launch items](TODO.md#before-launch) gate 1.0.0); TODO.md says which.

## Versioning

[Semantic versioning](https://semver.org/):

| Change | Before 1.0 | From 1.0 |
|---|---|---|
| A roadmap feature | minor (`0.X.0`) | minor (`X.Y.0`) |
| Fixes, internal work, docs, refactors with no visible change | patch (`0.X.Y`) | patch |
| Incompatible change to the link format or protocol (old links/peers stop working) | minor, noted as breaking | **major** |

`1.0.0` is the first public release.

## Features

| Version | Feature | Status |
|---|---|---|
| 0.1.0 | **Baseline**: password/passphrase generator, Secure Chat, Secure Share, docs, browser test suite | ✅ Done |
| 0.4.0 | **First real-world test feedback**: Secure Share as the home page, clearer naming, stronger and masked room passphrases with a strength meter | ✅ Done |
| 0.7.0 | **Names, organisation and domain**: CommonSec organisation, CommonSec Share app, served at `share.common-sec.org` | ✅ Done |
| 0.8.0 | **Guided sharing**: sender and recipient guided step by step, designed first for use on a call: speakable passphrases, a one-question creation page, the link copied automatically, guided waiting and recipient screens | ✅ Done (G1–G5), to be released |
| 0.9.0 | **Standard secure channel**: our own handshake and message encryption replaced by a published protocol (Noise `IKpsk1` on the snow library, under study), with forward secrecy (breaking) | Planned (study) |
| 0.10.0 | **Connectivity on restrictive networks**: users behind symmetric NAT or UDP-blocking firewalls can still connect, through an end-to-end encrypted relay fallback | Planned |
| 0.11.0 | **Static pages and SEO**: pre-rendered static pages, metadata and social previews, How it works and FAQ, sitemap, Search Console | ✅ Done, except the Search Console and Bing verification: waiting on the owner's accounts |
| 0.12.0 | **Encrypted files**: package files, encrypt them with a password in a standard format and download the encrypted file; upload one, decrypt it and download the contents | In progress (started early, 2026-10-29) |
| 1.0.0 | **Public launch**: release checklist and announcement, once the [pre-launch internal work](TODO.md#before-launch) is done | Planned |
| 1.1.0 | **Share a generated password**: a button on the password generator opens a one-way Secure Share with it, passphrase and link ready | Planned |
| 1.2.0 | **Local version of the app**, including a **portable desktop executable** that runs without installing (architecture to define: Tauri or Electron, PWA, Docker image, single file) | Planned |
| 1.3.0 | **AI-assisted memorable passphrases** (on-device model, entropy kept by the CSPRNG) | Planned |
| 1.4.0 | **Encrypted files for a public key**: load someone's public key, encrypt for it; only their private key opens the file | Planned |
| 1.5.0 | **Key pair wizard**: generate a key pair, send the public key over a secure channel, instructions to decrypt on another computer | Planned |
| 1.6.0 | **Encrypted file viewer and Secure Share hand-off**: view decrypted files without saving them, send encrypted files with Secure Share | Planned |
| — | **Logo and visual identity**: no version and no deadline (see below) | Unscheduled |

The versions skipped above (0.2.0, 0.3.0, 0.3.1, 0.5.0, 0.6.0) were internal work, released
before internal work moved to [TODO.md](TODO.md) on 2026-10-19; [CHANGELOG.md](../CHANGELOG.md)
has what each contained. Features planned at that point were renumbered: the `age` format was
0.11.0, the relay fallback 0.12.0, static pages 0.13.0, and the features after 1.0 were 1.3.0 to
1.5.0. On 2026-10-25 guided sharing became 0.8.0, ahead of them, and they moved up one: the
`age` format was 0.8.0, the relay fallback 0.9.0 and static pages 0.10.0.

**Why this order (2026-10-15, updated 2026-10-19 and 2026-10-25):** guided sharing comes first,
because the main flows should be right before more is built on them, and it's the next thing
people testing the site will see. Then the one breaking protocol change, because it's cheap
before 1.0 and a major version after it. Then the relay fallback, so
people on restrictive networks can connect at launch, and the static pages and SEO. Encrypted files
come after the static pages (decided 2026-10-26), so the tool is built as a static page from the start. The site is
already public, so the security basics in [TODO.md](TODO.md#before-launch) (repository hardening,
staging, tagged production) come before the standard secure channel (0.9.0), and the external
security review comes **just before launch**, so it reviews what actually ships. The logo needs iterations with
people and doesn't affect usability, so it isn't on the critical path. The high-priority
[fixes](#fixes-and-small-improvements) go in as patches between features, before launch.

### 0.4.0: First real-world test feedback ✅
**Context:** first test of the published site, between two devices on different networks (mobile data and wifi), with
both Secure Chat and Secure Share working across NAT.
**Done when:**
- **Secure Share is the home page**, with short guidance pointing to Secure Chat when several
  things need to be exchanged, or back and forth;
- the app has a clear name ("Secure Sharing"), and the page title changes with the selected tool;
- **room passphrases (Chat and Share) have no fixed pattern**: capitals, a number, a random
  separator, linking words at random positions, and not every word bent; the passphrase
  generator changes accordingly;
- passphrase fields show a **strength meter** (exact for generated passphrases, a conservative
  estimate for typed or edited ones);
- passphrases are **masked by default**, with a show/hide toggle, wherever they're entered or displayed.

### 0.7.0: Names, organisation and domain ✅
**Why early:** the public address changes, so this had to happen before anything is announced or
indexed. See [the UX/product/SEO review](reviews/2026-10-12-ux-product-seo.md#5-name-and-logo).
**Done:**
- organisation **CommonSec** (`common-sec` on GitHub, domain `common-sec.org`), an umbrella for
  several security tools, and app **CommonSec Share** (`common-sec/secure-share`), chosen after a
  trademark and domain check (decision D21);
- the repository lives in the organisation, and the site is served at
  `https://share.common-sec.org/` (custom domain verified for the organisation, HTTPS enforced);
- the app, README and docs use the new names consistently.

Moved out on 2026-10-15: organisation 2FA, rulesets and owners go to the GitHub hardening basics
(now [TODO.md I1](TODO.md#i1-github-hardening-basics)); the logo has its own
unscheduled item at the end.

### 0.8.0: Guided sharing
From the [guided sharing UX review](reviews/2026-10-19-ux-guided-sharing.md) (2026-10-19), with
its [user stories](reviews/2026-10-19-ux-guided-sharing.md#1-user-stories). **Goal:** sender and
recipient are guided step by step, designed first for using the app on a call (link in the chat,
passphrase said aloud). Done in this order; the open [fixes](#fixes-and-small-improvements) that
these cover point here.
**Done when:**
- [x] **G1. Speakable room passphrases.** Six fully random lowercase words from the full word list
      (about 59 bits, so an offline attack on recorded traffic isn't practical), matched exactly as given (no normalisation, key derivation unchanged), plain
      strength wording.
- [x] **G2. One-question creation page.** "What do you want to send?" and one button; the
      passphrase moves to the next screen; choosing your own words and "check who's receiving"
      go under More options; the Secure Chat pointer is one line; details move to How it works.
- [x] **G3. Link copied automatically.** An invitation with the link (never the passphrase) is
      copied on creation, with a fallback; "Copy link only", the share sheet and a QR code as
      secondary actions.
- [x] **G4. Guided waiting screen.** Numbered steps (paste the link, say the words, keep this
      page open), with "Keep my screen on" as part of the last step, and a line for when you're
      not on a call.
- [x] **G5. Guided recipient page.** What this is and that nothing is stored, "type the words they
      tell you", live connection stages, the result, then Done (clears everything) and Send
      something back.

### 0.9.0: Standard secure channel
**Goal:** the whole channel (handshake, chat messages, Share payloads, files and control messages)
runs on one published, reviewed protocol instead of our own construction, so reviewers check a
known design against its specification. **Changed 2026-10-25:** this item used to be the `age`
file format for Share payloads only; that was dropped because it would have added a second
construction next to ours ([D23](DECISIONS.md)).
**Why before launch:** it changes the protocol, so old links and peers stop working. Before 1.0
that's a minor version; after it, a major one.
**Now:** a study of the options (Noise, binding to WebRTC's DTLS, PAKE, MLS, HPKE) and their
browser libraries. The current recommendation is `Noise_IKpsk1_25519_ChaChaPoly_SHA256` with the
snow library compiled to WebAssembly, and a pre-shared key from the link secret and the
passphrase. A prototype in [prototypes/noise-wasm](../prototypes/noise-wasm/README.md) passes the
published test vectors and runs in Chromium; it showed that `IKpsk2` (WireGuard's position) would
let anyone with the link test passphrase guesses offline, which D9 rules out.
**Done when:**
- the protocol and its library (or our implementation of a published pattern, checked against
  its test vectors) are chosen and recorded as a decision;
- every message type uses it, with forward secrecy, no offline passphrase guessing (D9), host
  authentication against the link, and recorded traffic still safe from a future quantum computer;
- docs/PROTOCOL.md and the threat model are updated, the protocol version is bumped, and the
  release notes mark the change as breaking;
- unit and end-to-end tests cover the new protocol, including its published test vectors.

### 0.10.0: Connectivity on restrictive networks
**Context:** direct connections work for most networks, but fail when both sides are behind
restrictive NATs (symmetric NAT, common on corporate networks and some mobile carriers) or when a
firewall blocks UDP. Industry estimates put the share of WebRTC sessions that need a relay at
roughly 10–25%. Today those users simply can't connect ([COMMUNICATION.md](COMMUNICATION.md),
[DECISIONS.md D5](DECISIONS.md)).
**Goal:** those users can still share securely, without weakening end-to-end encryption, and
everyone else keeps direct connections.
**Done when:**
- **clear failure handling:** the app notices when no direct path is found (ICE fails or times
  out) and tells users plainly what happened and what to try (another network, mobile data).
  Done early, as fix [N1](#high-priority-restrictive-networks); the relay fallback updates the
  advice once it exists;
- **diagnostics:** a short, private connection report (which address types were found, whether
  UDP is blocked) to tell "restrictive NAT" from other failures;
- **relay fallback (TURN):** used only when a direct path fails. It carries traffic that is already
  DTLS-encrypted *and* encrypted by the app, so it can't read anything. It's reachable over UDP and
  over TLS on TCP 443, for firewalls that only allow HTTPS-like traffic;
- **relay provider decided**, preferring zero cost: self-hosted (e.g. coturn), or a free tier of a
  managed TURN service. What the relay operator sees (IP addresses, timing, volume) is documented
  in THREAT_MODEL.md;
- **no open relay for abuse:** short-lived, per-session TURN credentials;
- an **end-to-end test** where the direct path is blocked and the session must succeed through a
  local TURN container;
- COMMUNICATION.md, DECISIONS.md (D5) and THREAT_MODEL.md updated.

### 0.11.0: Static pages and SEO
**Goal:** people searching for how to send a password or a sensitive file securely find the app,
and shared links show a trustworthy preview. See
[the review](reviews/2026-10-12-ux-product-seo.md#7-seo-and-discoverability) and
[the static site assessment](reviews/2026-10-13-static-site-generation.md).
**Started early** (2026-10-29), at the owner's request, ahead of 0.9.0 and 0.10.0, so the
encrypted files tool (0.12.0) can be built as a static page from the start. Decision
[D24](DECISIONS.md#d24-one-static-page-per-tool-javascript-enhances-).
**Done when:**
- [x] every tool has a real, **pre-rendered static page** (`/`, `/chat/`, `/passwords/`) whose
      content is in the HTML without JavaScript, plus `/how-it-works/` and `/faq/`; room secrets
      stay in the URL fragment (`/#r=…`, `/chat/#r=…`; links in the old `#/chat?r=…` format are
      redirected);
- [x] each page has a keyword-led title, meta description, canonical URL, Open Graph and Twitter
      card tags, and a social image (a placeholder until the logo exists); `WebApplication` and
      `FAQPage` structured data;
- [x] `robots.txt`, `sitemap.xml`, favicon set, web manifest and `theme-color`;
- [x] a short **privacy note** (in the FAQ) says what the app sends where and that it uses no
      cookies or trackers;
- [ ] the site is verified in Google Search Console and Bing Webmaster Tools (search impressions
      without any tracking script): the owner's accounts, by DNS record, so no page changes.
      **The only item left, and it needs the owner;** nothing else waits on it, so 0.12.0 started;
- [x] the Lighthouse budgets in [TODO.md I4](TODO.md#i4-lighthouse-ci) pass, and CI keeps them
      passing.

### 0.12.0: Encrypted files
**Goal:** encrypt and decrypt files easily and locally in the browser, with a password, in a
standard format that other tools also open. Nothing is uploaded and it works offline. See
[IDEAS.md](IDEAS.md#encrypted-files-in-the-browser). This is the first step; public keys, a key
wizard, the viewer and the Secure Share hand-off follow in [1.4.0](#140-encrypted-files-for-a-public-key)
to [1.6.0](#160-encrypted-file-viewer-and-secure-share-hand-off).
**Started early** (2026-10-29), right after 0.11.0's code, at the owner's request ("take the next
one"), ahead of 0.9.0 and 0.10.0 as 0.11.0 was.
**Format:** the [file format spike](reviews/2026-10-28-file-format-spike.md) (2026-10-28) compared
`age`, OpenPGP and 7z on audits, crypto, speed, memory, bundle size and which tools open the result
offline. It recommends **OpenPGP (`openpgp.js`) in the profile GnuPG reads**, now decision
[D25](DECISIONS.md#d25-encrypted-files-are-openpgp-in-the-profile-gnupg-reads-with-openpgpjs--2026-10-29).
Password encryption is symmetric (AES-256), so it is already safe against quantum computers in
either format.
**Why after static pages:** the tool gets its own static page (`/files/`) and mounts into it,
"static first, JS enhances".
**Stories:**
- **F1. Encrypt.** *As someone with files to protect, I add one or more files or a folder, choose
  a password (a speakable one is suggested), and download one encrypted file.* Several files or a
  folder are packaged first as a ZIP inside the encrypted file; a single file is encrypted as is.
- **F2. Decrypt.** *As someone who received an encrypted file, I add it, type the password, and
  download what's inside.* A single file comes back as itself; a package comes back as a plain ZIP
  that the operating system opens, since browsers can't write folders.
- **F3. Open it elsewhere.** *As a recipient without this site, I can open the file with a common
  tool.* The page says which tools (for OpenPGP: GnuPG, Kleopatra, GPG Suite) and how.

**Done when:**
- [x] F1 and F2 work in Chromium, Firefox and WebKit, with the library pinned and bundled like
      Trystero; nothing is uploaded, nothing is stored, and the page works offline (once its
      library has loaded, a few seconds after the page);
- [x] large files stream instead of being held whole in memory, and the page states its size
      limits (2 GB in all; less on a phone);
- [x] the UI says before encrypting that a lost password means a lost file;
- [x] a decision records the format and why ([D25](DECISIONS.md)); ARCHITECTURE and THREAT_MODEL are updated;
- [x] unit and end-to-end tests cover F1 and F2, including interoperability with the format's
      reference tool (`gpg` for OpenPGP) in both directions and for packaged folders;
- [ ] tried on a real phone (Android and iPhone), as the spike asked: a large file, and the
      size the page can hold there.

### 1.0.0: Public launch
**Goal:** announce the app, once the features above and the
[pre-launch internal work](TODO.md#before-launch) (security basics, staging, testing, hosting and
headers, the external security review) are done.
**Done when:**
- every *Before launch* item in [TODO.md](TODO.md#before-launch) is done;
- the release checklist (on staging) includes manual WebRTC tests across two networks, a real
  iPhone and Edge on Windows;
- a launch checklist lists the channels (Show HN, Reddit, Product Hunt, AlternativeTo, privacy
  tool directories) and what each requires, and the announcement goes out.

### 1.1.0: Share a generated password
**Goal:** generate a password and send it safely in one step.
**Done when:**
- each generated password has a **"Share securely"** button that opens Secure Share with the
  password as the text, a passphrase generated, and the one-time link ready to create;
- the password is handed over **in memory only**: never in the URL, history, storage or logs;
- covered by an end-to-end test (generate → share → receive the same password).

### 1.2.0: Local version of the app
**Goal:** the same app usable without trusting a website at run time: installed or run locally.
**Portable desktop executable (added 2026-10-30):** one of the deliverables is a standalone
desktop build that runs **without installing**: a single executable (Windows `.exe`, Linux
AppImage, macOS `.app`) that can be downloaded, verified and run from any folder or a USB stick,
with no admin rights and nothing left behind. **Why:** browser extensions with access to a page
can read what's typed and shown in it, passphrases and received secrets included, and the threat
model leaves malicious extensions out of scope. A desktop build runs in its own window with no
extensions, so that risk goes away. It doesn't protect against a compromised operating system.
**Architecture to define**, comparing:
- **PWA**: installable from the site, works offline after the first visit. Still delivered by the
  website the first time and on updates.
- **Electron** (or a lighter shell such as Tauri): desktop app with signed releases. A bigger
  dependency and attack surface. The candidate for the portable executable: check which shell
  gives a single portable file per platform, keeps WebRTC working, and loads no extensions or
  remote content.
- **Docker image**: serve the app locally from a pinned, reproducible image.
- **Single self-contained HTML file**: download once, verify its checksum or signature, open
  from disk. Needs a check that Web Crypto, WebRTC and storage work from a local file.

**Done when:** the options are compared in docs, one or more are chosen and shipped, including the
portable desktop executable for Windows, macOS and Linux, and releases are reproducible and
verifiable (checksums or signatures).

### 1.3.0: AI-assisted memorable passphrases
**Goal:** an optional "make it a sentence" mode in which an on-device model turns CSPRNG-chosen
words and a number into a memorable phrase, before the usual random variation rules.
**Done when:** the design in [IDEAS.md](IDEAS.md#ai-assisted-memorable-passphrases) is
implemented, the output is validated to contain every chosen word, the shown strength counts only
CSPRNG choices, and it falls back cleanly when no on-device model is available.

### 1.4.0: Encrypted files for a public key
**Goal:** encrypt a file so that only one person, the holder of a private key, can open it, with
no shared password.
**Stories:**
- **F4.** *As a sender, I load the recipient's public key (pasted, or from a file), and the file I
  encrypt can only be opened with their private key.*
- **F5.** *As the recipient, I load my private key (protected by its own passphrase) to decrypt the
  file in the page, or I use GnuPG or Kleopatra.*

**Post-quantum:** classical keys (X25519) aren't safe against a future quantum computer. `age` has
hybrid post-quantum keys today; OpenPGP has a standard for them
([RFC 9980](https://www.rfc-editor.org/rfc/rfc9980)), but `openpgp.js` 6.3.2 doesn't implement it
and GnuPG has it only in its 2.5 development series. Check both again when this starts, and record
whether post-quantum keys are required.
**Done when:** F4 and F5 work, the app stores no keys, and interoperability with the reference tool
is tested both ways.

### 1.5.0: Key pair wizard
**Goal:** someone with no key can get one and receive encrypted files, guided step by step.
**Stories:**
- **F6.** *As a recipient, a wizard generates my key pair in the browser and has me protect the
  private key with a passphrase and save it.*
- **F7.** *As that recipient, I send my public key to the sender through Secure Share (or Chat), so
  it arrives unaltered.*
- **F8.** *As that recipient, I get clear instructions to decrypt on another computer with GnuPG,
  Kleopatra or GPG Suite.*

**Done when:** F6 to F8 are covered by end-to-end tests, including the public key arriving through
Secure Share and a file encrypted for it opening with the reference tool.

### 1.6.0: Encrypted file viewer and Secure Share hand-off
**Goal:** look at a decrypted file without ever saving the plaintext, and send encrypted files in
one click.
**Stories:**
- **F9.** *As a recipient, I view a decrypted file (text, images, audio, video, PDF) in the page,
  from memory, and nothing is written to disk unless I choose to save it.* HTML and SVG never run
  scripts; the threat model says what this doesn't cover (swap, the browser's viewer caches).
- **F10.** *As a sender, "Send with Secure Share" opens Share with the encrypted file attached, in
  memory.* The recipient keeps a file that stays encrypted at rest.
- **F11.** *As a Secure Share recipient, an encrypted file I receive opens straight in the viewer.*

**Done when:** F9 to F11 work and are covered by end-to-end tests, and the CSP changes the viewer
needs (`media-src blob:`, possibly `frame-src blob:` for PDFs) are documented.

### Unscheduled: Logo and visual identity
**Why no version:** it needs several iterations and feedback from people, and it doesn't affect
usability, so nothing waits for it. Pages use a placeholder social image until it's ready.
**Done when:** a logo exists for the app (and, if wanted, a mark for the organisation) as SVG plus
favicon, `apple-touch-icon`, manifest icons and a 1200 × 630 social image, and they replace the
placeholders. Released as a patch of whichever version is current.

## Fixes and small improvements

User-facing improvements that don't need a feature of their own. They're picked up between
features, **highest priority first**. Each one ends with a commit, and a release of one or more
of them is a patch version (`0.X.Y`). Larger work goes through [IDEAS.md](IDEAS.md) and the
features above.

Legend: `[ ]` to do · `[x]` done (keep for one release, then remove).

### High priority: restrictive networks

Some networks block what the app needs: firewalls that drop UDP or WebRTC, strict NATs, or
filters (firewall rules, NIDS/NIPS) that block the WebSocket relays. Until the
[relay fallback (0.10.0)](#0100-connectivity-on-restrictive-networks), users should at least learn
what happened instead of waiting forever.
- [x] **N1. Say when the network blocks the connection.** Two cases are detected, with no new
      third party and nothing sent anywhere: the other side was found through the relays but no
      direct connection could be opened (Trystero's "could not connect after exchanging SDP"),
      and no relay can be reached for 10 s while the room needs them. Share (sender and recipient)
      and Chat (host and guest) say what failed and what to try: another network such as mobile
      data, or asking the network's IT team whether WebRTC is allowed. Deliberate blocking isn't
      worked around.

### High priority: security findings

From [code scanning alert #1](https://github.com/common-sec/secure-share/security/code-scanning/1)
(clear-text storage of sensitive data).
- [x] **K1. No passphrase in browser storage.** The chat host's passphrase was kept in
      sessionStorage, in clear, to show it again after a reload. It now lives only in memory;
      after a reload the Invite panel says it isn't kept.
- [x] **K2. Host state survives a reload only.** The IndexedDB record used to stay for 24 h after
      the tab closed. The page now refreshes it every 30 s and on hide/unload; one not refreshed
      for 2 minutes, or past the room's time limit, is refused and deleted, and Chat sweeps stale
      ones on every visit. A host whose tab can't resume sees "This room has ended".
- [x] **K3. Room time limit.** Every room closes for everyone after 4 hours by default (1, 8 or
      24 h under "Advanced options" in Chat; Share uses the default). The host sees the closing
      time on creation and in the Invite panel, guests when they're admitted and the Share sender
      under the link; everyone is warned 10 minutes before.
- [ ] **K4. Trial dropping host resume.** Build a variant that stores nothing (a reload or a
      background-tab reload ends the room) and try it on phones and computers: how often rooms
      are lost in normal use, and whether clearer warnings (before reloading, when the tab goes to
      the background, on mobile) keep it usable. Then choose between it and the current
      reload-only resume ([D22](DECISIONS.md#d22-a-chat-hosts-room-survives-a-reload-not-a-closed-tab-)).

### High priority: sending and receiving UX

From the [UX, product and SEO review](reviews/2026-10-12-ux-product-seo.md#2-ux-secure-share-the-main-flow).
**Goal:** a first-time sender or recipient, on a phone or a computer, understands what's
happening, trusts it, and succeeds.

#### Sender
- [x] **S1. Keep the phone awake while waiting.** Request a Screen Wake Lock until delivery; warn
      when the tab goes to the background; explain before creating the link that the page must
      stay open.
- [ ] **S2. Easier link sharing** (→ G3). A "Send link…" button using the system share sheet (Web Share
      API); a QR code for handing the link to a phone nearby; "Copy invitation" text that reminds
      people to send the passphrase **another way**.
- [ ] **S3. Main action visible on a phone** (→ G2). Shorter intro (details move to a "How it works"
      disclosure), a smaller default text area, and a sticky primary button on mobile.
- [x] **S4. Waiting screen focus.** Hide the intro once the link exists; show only the steps and
      the status.
- [x] **S5. Delivery signal when the tab isn't visible.** Update the tab title ("✓ Delivered");
      optionally a notification, if the user allows it.
- [ ] **S6. Plain-language strength** (Share → G1; the password page stays here). "Strong enough for this room ✓" in place of "Fair · ≈57
      bits", with the bits as detail on demand. Same on the password page.
- [x] **S7. Clearer approval option.** "Let me check who's receiving before sending (compare a
      code by phone)" in place of "Ask me before delivering".

#### Recipient
- [ ] **R1. Context and trust** (→ G5). Explain what this is, that it's open source (link to the code and
      How it works), what happens next, and that nothing is stored.
- [x] **R2. Mask received secrets.** Hidden by default, with Show, Copy and "Clear from screen".
- [x] **R3. Tab title.** "You've received a secure delivery" in place of "Share once".
- [ ] **R4. Next step after receiving** (→ G5). "Send something back securely" (opens a new share) and
      "Done" (clears everything).
- [ ] **R5. Live connection stages** (→ G5). Finding the sender → connecting → receiving %; after a
      timeout, actionable advice (ask the sender to keep the page open, try another network).

#### Everywhere
- [x] **A1. Labels.** Associate every visible label with its field (the message text area isn't).
- [ ] **A2. Tap targets ≥ 44 px.** Navigation, "choose files", inline links, the logo link.
- [x] **A3. Status announcements.** `aria-live` on every status change (Share only partly has it).
- [ ] **A4. Focus and contrast.** Visible keyboard focus everywhere; check muted-text contrast in
      both themes.
- [ ] **P1. Plain language on the password page.** "Generated on your device. Nothing is sent
      anywhere." in place of "Generated locally with `crypto.getRandomValues`", with technical
      detail in a disclosure.

Where possible, each item comes with an end-to-end test (the axe-core accessibility checks
already run on every page).

### Medium priority: support and feedback links

Plain links only: no embedded widget, button script, badge or counter
loaded from a third party ([IDEAS.md](IDEAS.md#support--feedback-links)). The privacy note it
included moves into the FAQ (0.11.0).

- [ ] **L1. Star on GitHub.** A plain link to the repository in the footer.
- [ ] **L2. Donations.** Patreon and/or Buy Me a Coffee links in the footer.
- [ ] **L3. Rating.** A "+1 / rate us" link to a public rating page (to be chosen), in the footer
      and once after a successful share or delivery ("Did this help?"), never as a popup.
