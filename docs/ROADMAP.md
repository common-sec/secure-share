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
| 0.7.0 | **Names, organisation and domain**: CommonSec organisation, CommonSec Share app, served at `share.common-sec.org` | ✅ Done (to tag) |
| 0.8.0 | **Standard encryption format**: Share payloads in the audited `age` format instead of our own framing (breaking) | Next |
| 0.9.0 | **Connectivity on restrictive networks**: users behind symmetric NAT or UDP-blocking firewalls can still connect, through an end-to-end encrypted relay fallback | Planned |
| 0.10.0 | **Static pages and SEO**: pre-rendered static pages, metadata and social previews, How it works and FAQ, sitemap, Search Console | Planned |
| 1.0.0 | **Public launch**: release checklist and announcement, once the [pre-launch internal work](TODO.md#before-launch) is done | Planned |
| 1.1.0 | **Share a generated password**: a button on the password generator opens a one-way Secure Share with it, passphrase and link ready | Planned |
| 1.2.0 | **Local version of the app** (architecture to define: PWA, Electron, Docker image, single file) | Planned |
| 1.3.0 | **AI-assisted memorable passphrases** (on-device model, entropy kept by the CSPRNG) | Planned |
| — | **Logo and visual identity**: no version and no deadline (see below) | Unscheduled |

The versions skipped above (0.2.0, 0.3.0, 0.3.1, 0.5.0, 0.6.0) were internal work, released
before internal work moved to [TODO.md](TODO.md) on 2026-10-19; [CHANGELOG.md](../CHANGELOG.md)
has what each contained. Features planned at that point were renumbered: the `age` format was
0.11.0, the relay fallback 0.12.0, static pages 0.13.0, and the features after 1.0 were 1.3.0 to
1.5.0.

**Why this order (2026-10-15, updated 2026-10-19):** the one breaking protocol change comes
first, because it's cheap before 1.0 and a major version after it. Then the relay fallback, so
people on restrictive networks can connect at launch, and the static pages and SEO. The site is
already public, so the security basics in [TODO.md](TODO.md#before-launch) (repository hardening,
staging, tagged production) come before the next feature release, and the external security review
comes **just before launch**, so it reviews what actually ships. The logo needs iterations with
people and doesn't affect usability, so it isn't on the critical path. The high-priority
[fixes](#fixes-and-small-improvements) go in as patches between features, before launch; the
[guided sharing](#before-the-next-release-guided-sharing) items (2026-10-19) come first, before
0.8.0, because the main flows should be right before more is built on them.

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

### 0.8.0: Standard encryption format
**Goal:** encrypt with a standard, audited format instead of our own framing, so reviewers check
a known construction rather than ours. See
[IDEAS.md](IDEAS.md#encrypt-share-payloads-in-the-age-format).
**Why before launch:** it changes the wire format, so old links and peers stop working. Before
1.0 that's a minor version; after it, a major one.
**Done when:**
- Share payloads use the **`age` format** (the `typage` library, pinned and bundled like
  Trystero); the key schedule is reviewed at the same time (e.g. scrypt as in `age`'s passphrase
  recipient, or our PBKDF2-derived key as an X25519 or symmetric recipient), and the choice is
  recorded as a decision;
- Chat's message framing is assessed for the same change; it either moves too or the reason it
  stays is documented;
- docs/PROTOCOL.md and the threat model are updated, the protocol version is bumped, and the
  release notes mark the change as breaking;
- unit and end-to-end tests cover the new format, including interoperability with the reference
  `age` tool for Share payloads.

### 0.9.0: Connectivity on restrictive networks
**Context:** direct connections work for most networks, but fail when both sides are behind
restrictive NATs (symmetric NAT, common on corporate networks and some mobile carriers) or when a
firewall blocks UDP. Industry estimates put the share of WebRTC sessions that need a relay at
roughly 10–25%. Today those users simply can't connect ([COMMUNICATION.md](COMMUNICATION.md),
[DECISIONS.md D5](DECISIONS.md)).
**Goal:** those users can still share securely, without weakening end-to-end encryption, and
everyone else keeps direct connections.
**Done when:**
- **clear failure handling:** the app notices when no direct path is found (ICE fails or times
  out) and tells users plainly what happened and what to try (another network, mobile data);
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

### 0.10.0: Static pages and SEO
**Goal:** people searching for how to send a password or a sensitive file securely find the app,
and shared links show a trustworthy preview. See
[the review](reviews/2026-10-12-ux-product-seo.md#7-seo-and-discoverability) and
[the static site assessment](reviews/2026-10-13-static-site-generation.md).
**Done when:**
- every tool has a real, **pre-rendered static page** (`/`, `/chat/`, `/passwords/`) whose
  content is in the HTML without JavaScript, plus `/how-it-works/` and `/faq/`; room secrets stay
  in the URL fragment;
- each page has a keyword-led title, meta description, canonical URL, Open Graph and Twitter card
  tags, and a social image (a placeholder until the logo exists); `WebApplication` and `FAQPage`
  structured data;
- `robots.txt`, `sitemap.xml`, favicon set, web manifest and `theme-color`;
- a short **privacy note** (in the FAQ) says what the app sends where and that it uses no cookies
  or trackers;
- the site is verified in Google Search Console and Bing Webmaster Tools (search impressions
  without any tracking script);
- the Lighthouse budgets in [TODO.md I4](TODO.md#i4-lighthouse-ci) pass.

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
**Architecture to define**, comparing:
- **PWA**: installable from the site, works offline after the first visit. Still delivered by the
  website the first time and on updates.
- **Electron** (or a lighter shell such as Tauri): desktop app with signed releases. A bigger
  dependency and attack surface.
- **Docker image**: serve the app locally from a pinned, reproducible image.
- **Single self-contained HTML file**: download once, verify its checksum or signature, open
  from disk. Needs a check that Web Crypto, WebRTC and storage work from a local file.

**Done when:** the options are compared in docs, one or more are chosen and shipped, and releases
are reproducible and verifiable (checksums or signatures).

### 1.3.0: AI-assisted memorable passphrases
**Goal:** an optional "make it a sentence" mode in which an on-device model turns CSPRNG-chosen
words and a number into a memorable phrase, before the usual random variation rules.
**Done when:** the design in [IDEAS.md](IDEAS.md#ai-assisted-memorable-passphrases) is
implemented, the output is validated to contain every chosen word, the shown strength counts only
CSPRNG choices, and it falls back cleanly when no on-device model is available.

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

### Before the next release: guided sharing

From the [guided sharing UX review](reviews/2026-10-19-ux-guided-sharing.md) (2026-10-19), with
its [user stories](reviews/2026-10-19-ux-guided-sharing.md#1-user-stories). **Goal:** sender and
recipient are guided step by step, designed first for using the app on a call (link in the chat,
passphrase said aloud). Done in this order, before 0.8.0; the open items below that these cover
point here.

- [ ] **G1. Speakable room passphrases.** Four lowercase common words from a word list curated for
      speaking, matched exactly as given (no normalisation, key derivation unchanged), plain
      strength wording.
- [ ] **G2. One-question creation page.** "What do you want to send?" and one button; the
      passphrase moves to the next screen; choosing your own words and "check who's receiving"
      go under More options; the Secure Chat pointer is one line; details move to How it works.
- [ ] **G3. Link copied automatically.** An invitation with the link (never the passphrase) is
      copied on creation, with a fallback; "Copy link only", the share sheet and a QR code as
      secondary actions.
- [ ] **G4. Guided waiting screen.** Numbered steps (paste the link, say the words, keep this
      page open), with "Keep my screen on" as part of the last step, and a line for when you're
      not on a call.
- [ ] **G5. Guided recipient page.** What this is and that nothing is stored, "type the words they
      tell you", live connection stages, the result, then Done (clears everything) and Send
      something back.

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
included moves into the FAQ (0.10.0).

- [ ] **L1. Star on GitHub.** A plain link to the repository in the footer.
- [ ] **L2. Donations.** Patreon and/or Buy Me a Coffee links in the footer.
- [ ] **L3. Rating.** A "+1 / rate us" link to a public rating page (to be chosen), in the footer
      and once after a successful share or delivery ("Did this help?"), never as a popup.
