# Ideas

Ideas live here until they are chosen for the [roadmap](ROADMAP.md). Anyone can add one.
Nothing here is being worked on unless the roadmap or [TODO.md](TODO.md) says so.

## Process

| Status | Meaning |
|---|---|
| 💡 Proposed | Written down, not decided |
| ✅ Accepted → vX.Y | Chosen; it now lives on the roadmap under that version |
| ✅ Accepted → TODO Iₙ | Chosen internal work (platform, build, CI/CD, security process); it lives in [TODO.md](TODO.md) under that item |
| 📋 Fix | Small enough to skip a feature; listed by priority in the roadmap's [fixes](ROADMAP.md#fixes-and-small-improvements) |
| 🅿️ Parked | Good idea, not now (reason given) |
| ❌ Rejected | Won't do (reason given, so it isn't re-proposed) |

Template for a new idea:

```markdown
## Title
**Status:** 💡 Proposed
**Problem:** what hurts today, and for whom.
**Proposal:** what we'd build.
**Trade-offs / risks:** security, privacy, complexity, dependencies.
```

## Product principles (filter for every idea)

- **The story is one: share information securely and easily between browsers.** One-way Share
  and Chat are two shapes of that story.
- **Privacy by default, not invisibility.** No third-party scripts or cookies, because they would
  weaken security (any script can read the room secret in the URL) and we don't need them. The
  goal is *not* anonymity or untraceability.
- **Keep it simple and auditable.** Few dependencies, proven libraries for hard problems, no
  hand-rolled cryptographic primitives.

---

## Tests run anywhere
**Status:** ✅ Accepted → 0.2.0 (done)
**Problem:** the headless runner needs Node, which isn't on every developer machine.
**Proposal:** a Python runner (Python already serves the app) using Playwright, used both locally and in CI.

## No runtime CDN (vendor Trystero)
**Status:** ✅ Done in 0.6.0, as part of the reproducible TypeScript build (bundled from the npm lockfile instead of committed)
**Problem:** jsDelivr serves the P2P library at runtime. Whoever serves the JS controls the app.
**Proposal:** commit a pinned build of Trystero to `src/vendor/`, record its checksum, and drop the CDN from the CSP.

## Type checking with JSDoc
**Status:** ❌ Rejected, superseded by full TypeScript with a reproducible build (0.6.0). Once
there's a build system for pinned dependencies anyway, TypeScript gives the same checks with less
noise. Reproducible builds keep "served code = reviewed code" verifiable.

## Support & feedback links
**Status:** 📋 Fix ([ROADMAP.md](ROADMAP.md#medium-priority-support-and-feedback-links)); the privacy note moves into the FAQ (0.11.0)
**Problem:** there's no way for people to support or rate the project, and no visibility for the portfolio.
**Proposal:** plain links only (no embedded widgets, buttons, badges or counters loaded from third parties):
- **Developers:** "★ Star on GitHub" link to the repository. Not GitHub's button script.
- **Donations:** Patreon and/or Buy Me a Coffee links.
- **Non-developer users:** "+1 / rate us" link to a public rating page (e.g. AlternativeTo,
  Product Hunt or Trustpilot, to be chosen).
- **Where:** footer, and once after a successful share or delivery ("Did this help?"), never as a popup.
- **Privacy note:** a short page stating what the app sends where (links to ARCHITECTURE.md) and that it uses no cookies or trackers.

**Trade-offs:** none for security. Clicking a link is the user's choice and leaves the app.

## AI-assisted memorable passphrases
**Status:** ✅ Accepted → 1.3.0
**Problem:** random words are secure but hard to remember as a list. A sentence is easier.
**Proposal:**
1. **JS (CSPRNG) chooses** the words from the word list and a number.
2. An **on-device** model (e.g. Chrome's built-in Prompt API) builds a short, memorable sentence
   with **all** those words and the number, placing the number anywhere it fits. It may change
   word forms (plurals, adjectives, adverbs) and add small linking words.
3. **JS validates** the sentence: every chosen word is present (some form of it), the number
   is present, and only letters, digits and spaces are used. Otherwise it retries, and after 3
   tries falls back to the normal generator.
4. **JS (CSPRNG) applies variation rules** on top: one capital at a syllable start per word, at
   least one sound-alike or look-alike character replacement (`c→k`, `s→z`, `o→0`, `a→@`…), and one
   random separator character instead of spaces.

**Entropy accounting (what makes this safe):**
- The model's output is predictable, so **anything the model decides counts as 0 bits**: word
  order, added words, word-form changes.
- Counted: the *set* of chosen words, `log2(C(N, w))` (order doesn't count because the model may
  reorder), plus the number, plus the CSPRNG variation rules.
- Example: 877 words, w = 4: about 34.5 bits for the set, 6.6 for a 0–99 number, about 9 for
  syllable capitals, 5 for a replacement and 3 for the separator, so about 58 bits. **w = 6 gives
  about 75 bits**, which suggests a default of 6 words.

**Trade-offs / risks:**
- **On-device only.** A cloud model would receive the password. The model must run locally, e.g.
  the Prompt API (no network) or a local Ollama.
- **Caches and logs:** Chrome's built-in model doesn't persist prompts. Exploiting a local cache
  needs access to the device, which is already out of scope in the threat model.
- **Availability:** Chromium-based browsers only, so the option is hidden when unsupported.
- **The model can't weaken the password:** if it drops a word, validation fails and we retry.

## Sandboxed development environment
**Status:** ✅ Accepted → 0.3.0 (done)
**Problem:** installing dev tooling and packages on the host gives any compromised dependency
the developer's full user rights.
**Proposal:** every task in a pinned, hardened container: one small Node dev image, and official
images used as-is for tests and each scanner. See docs/DEVELOPMENT.md.

## Rootless container engine for development
**Status:** 💡 Proposed
**Problem:** the current WSL setup uses Docker's root daemon, and `docker` group membership is
root-equivalent inside WSL.
**Proposal:** switch to rootless Docker (`scripts/setup-docker-wsl.sh` already supports it) or
rootless Podman.

## Name, logo and organisation
**Status:** ✅ Names, organisation and domain done in 0.7.0; organisation hardening → TODO I1; logo unscheduled (see the roadmap)
**Proposal:** a distinctive name and logo for the app, and a dedicated GitHub organisation, an
umbrella for several security tools whose name is chosen separately (decided: **CommonSec**, app
**CommonSec Share**, see decision D21): organisation-wide 2FA, rulesets and Allstar policies, several owners, and a clean
`<org>.github.io` address. Shortlist and criteria in
[the 2026-10-12 review](reviews/2026-10-12-ux-product-seo.md#5-name-and-logo).

## Sending and receiving UX
**Status:** 📋 Fix, high priority ([ROADMAP.md](ROADMAP.md#high-priority-sending-and-receiving-ux))
**Proposal:** fixes from the 2026-10-12 review: phone wake lock, share sheet and QR, recipient
trust and context, masked received secrets, plain language, accessibility basics.

## SEO and launch readiness
**Status:** ✅ Accepted → 0.11.0 (static pages and SEO); the launch itself is 1.0.0
**Proposal:** pre-rendered static pages per tool, metadata and social previews, How it works and
FAQ, sitemap, Search Console and Bing Webmaster Tools, Lighthouse CI, launch checklist.

## Translations
**Status:** 💡 Proposed
**Proposal:** Spanish first, then other languages, as static pages with `hreflang`. It widens
both reach and SEO.

## Usage statistics from access logs
**Status:** 💡 Proposed
**Problem:** we don't know whether anyone uses the tools.
**Proposal:** search impressions and clicks from Google Search Console and Bing Webmaster Tools (no script on the page; planned in 0.11.0). Beyond that, read the static host's aggregate access logs (page and module loads). There's no
code in the app, and the URL fragment holding secrets is never sent to the host. Optionally, a
self-hosted, opt-in event counter that stores no IP and no identifier.

## Split into three apps
**Status:** ❌ Rejected. Share and Chat tell the same story, sharing data securely and easily, so
they stay in one app. See *Extract reusable libraries* instead.

## Extract reusable libraries (passphrase generator, room protocol)
**Status:** 💡 Proposed. Only when a library proves useful outside this app.
**Proposal:** move just that library into its own package (e.g. the passphrase generator as a
`<passphrase-generator>` web component), keeping the app itself whole.

## Full TypeScript with a reproducible build
**Status:** ✅ Done in 0.6.0
**Problem:** dependencies are fetched from a CDN at runtime, and nothing checks types.
**Proposal:** TypeScript plus a build that installs pinned, locked dependencies, bundles them, and
produces byte-identical output on every rebuild, so releases can be verified against the source.

## Plain-language "how it works" guide
**Status:** 💡 Proposed
**Problem:** the security design is hard to follow without a cryptography background, even for
the maintainer.
**Proposal:** a guided explanation, started in a dedicated learning session: what each primitive
does, why the protocol is shaped this way, and what the alternatives (PAKE, Noise, age, MLS,
Argon2) would change. Its outcome could become `docs/HOW_IT_WORKS.md` for users and contributors.

## Encrypt Share payloads in the `age` format
**Status:** ❌ Dropped on 2026-10-25 ([D23](DECISIONS.md)): a file format next to our own channel
added a second construction instead of replacing ours. Roadmap 0.9.0 is now a standard secure
channel (Noise); age or HPKE may come back for data that leaves the channel.
**Proposal:** use the audited, standard `age` format (`typage`) for Share payloads instead of our
AES-GCM framing. One more dependency, but a standard and interoperable format.

## Encrypted files in the browser
**Status:** ✅ Accepted → 0.12.0 (password encryption), 1.4.0 (public keys), 1.5.0 (key pair
wizard), 1.6.0 (viewer and Secure Share hand-off)
**Problem:** encrypting a file to keep or send usually means installing a tool, and opening one
means saving a decrypted copy to disk.
**Proposal:** a Files page that packages, encrypts and decrypts files locally in a standard format,
first with a password, later with public keys and a wizard that creates them; then a viewer that
shows decrypted files from memory and a one-click hand-off to and from Secure Share. The format
(OpenPGP recommended by the [spike](reviews/2026-10-28-file-format-spike.md)) also opens with
common tools.
**Trade-offs / risks:** one more pinned dependency (and a ZIP library for packaging); memory limits
unless large files stream; the OS or the browser's viewers may still leave traces.

## Group chat on MLS (RFC 9420)
**Status:** 🅿️ Parked: heavy (WASM). Only worth it if Chat becomes the primary product. It would
remove trust in the host for membership and add forward secrecy.

## PAKE for passphrase authentication (CPace / SPAKE2 / OPAQUE)
**Status:** 🅿️ Parked: no mature, maintained browser library today. The current design already
prevents offline guessing.

## Own signaling relay
**Status:** 💡 Proposed
**Problem:** browsers find each other through public Nostr relays. That works, but those relays
were built for social media, owe us no uptime (rate limiting was seen in testing), and their
operators see users' IP addresses and timing. See [COMMUNICATION.md](COMMUNICATION.md) and
[DECISIONS.md D3](DECISIONS.md#d3-signaling-through-public-nostr-relays-via-trystero-).
**Proposal:** run our own small signaling relay and make signaling pluggable: our relay by
default, public Nostr relays as a fallback. Options: Trystero's `ws-relay` strategy, or a Nostr
relay (e.g. strfry, nostr-rs-relay) that accepts only our ephemeral event kinds. It only carries
the encrypted connection cards (a few KB per connection); data still goes directly between browsers.
**Trade-offs:** we'd operate a service (uptime, abuse handling, rate limits) and see IP addresses
ourselves. Hosting must be zero-cost: check whether Cloudflare Workers + Durable Objects
(WebSockets) fit the free tier. The e2e tests already use a local relay of this kind.

## Store-and-forward delivery
**Status:** 💡 Proposed
**Problem:** with Secure Share, the sender's tab must stay open until the recipient opens the
link. That's the biggest usability limit.
**Proposal:** an optional mode in which the encrypted payload waits on a server until it's
fetched once, then is deleted, as one-time-secret services do but end-to-end encrypted, so the
server can't read it.
**Trade-offs:** it **changes the product promise** ("nothing is stored on any server", even if
encrypted); it needs server storage, abuse controls and size limits; and it isn't free to run.
A product decision first, then a technical one.

## Optional TURN relay
**Status:** ✅ Accepted → 0.10.0, as part of connectivity on restrictive networks
**Problem:** peers behind strict NATs or firewalls can't connect.
**Proposal:** an opt-in TURN server (self-hosted, or a paid service as a sustainability option). It
only carries data that is already end-to-end encrypted.

## End-to-end tests with real WebRTC
**Status:** ✅ Accepted → 0.5.0
**Proposal:** Playwright drives several browser contexts as host and guests through the real UI,
with a local Nostr relay container in CI so real WebRTC and Trystero are exercised without
depending on public relays.

## DAST and fuzzing (host and clients)
**Status:** ✅ Accepted → TODO I7
**Proposal:** a pinned OWASP ZAP scan of the served app, plus fuzzing of everything a peer or a
link can feed into the host and into clients: handshake and protocol messages, files, URL
parameters, nicknames. Every crash becomes a regression test.

## OpenSSF Scorecard
**Status:** ✅ Accepted → TODO I1 (Scorecard action and badge) and I8 (every check cleared)
**Proposal:** publish the repository, run the Scorecard action, and clear its checks (branch
protection, signed releases, fuzzing, pinned dependencies, token permissions, and so on). It's an
independent, visible signal for auditors and users.

## Security posture management
**Status:** ✅ Accepted → TODO I8 (GitHub basics in I1)
**Problem:** security checks are spread over several tools and repository settings. Re-verifying
hardening that's already done on every commit (the old `static-checks.sh`) is noise, but
regressions must still be noticed.
**Proposal:** one place that tracks every control: scanner results as SARIF in GitHub code
scanning, Scorecard and Allstar for repository policy, specialised linters for GitHub Actions and
container configs, and a short posture document. Custom Semgrep rules only where no existing
check fits.

## Pre-commit checks
**Status:** 💡 Proposed (to decide in TODO I8)
**Problem:** some mistakes are cheaper to stop before they're committed. Above all secrets: once
pushed, a secret is in history and must be rotated.
**Options:**
- **The `pre-commit` framework**: popular, but it's a Python tool installed on the host and runs
  hooks fetched from other repositories on the host. That conflicts with "nothing runs on the
  host" unless every hook is pinned by commit and runs in a container.
- **A small versioned git hook** (`.githooks/pre-commit`, enabled with
  `git config core.hooksPath .githooks`) that runs only fast container checks on the staged files,
  e.g. `docker compose run --rm trufflehog` on the staged diff. Heavier scans stay in CI.

**Leaning:** the second, limited to secret scanning, since that's what's irreversible after a push.

## Safari and Edge coverage
**Status:** ✅ Accepted → TODO I3
**Proposal:** run the unit and end-to-end tests on WebKit (Safari's engine, used by every iOS
browser) as well as Chromium and Firefox; add Edge only where it differs from Chromium.

## Share a generated password in one step
**Status:** ✅ Accepted → 1.1.0
**Proposal:** a "Share securely" button next to each generated password that opens Secure Share
pre-filled (in memory, never via the URL), with passphrase and one-time link ready.

## Local version of the app
**Status:** ✅ Accepted → 1.2.0
**Problem:** using the website means trusting whatever it serves on each visit.
**Proposal:** a local way to run the same app: a PWA, Electron/Tauri, a Docker image, or a single
self-contained HTML file. The architecture is still to be decided; see the roadmap item.

## Hosting: GitHub Pages and alternatives
**Status:** 💡 Proposed (context for TODO I5, before 1.0.0)
**Context:** the plan is free hosting on GitHub Pages. To weigh:
- **Privacy:** GitHub, like any host, sees visitors' IP addresses and page requests, and its
  privacy statement covers that logging. The URL fragment holding room secrets is never sent.
  Pages gives the site owner **no** visitor statistics.
- **Headers:** Pages doesn't allow custom response headers. The CSP works through the `<meta>`
  tag, but `frame-ancestors` (clickjacking protection), HSTS preload and
  `X-Content-Type-Options` can't be set. A frame-busting check in the page can stand in for
  `frame-ancestors`.
- **Free alternatives:** Cloudflare Pages (custom headers, cookieless server-side analytics,
  but Cloudflare sees all traffic); Codeberg Pages (privacy-focused, non-profit); Netlify (custom
  headers, paid analytics).

## Staging environment
**Status:** ✅ Accepted → TODO I2
**Problem:** every push to `main` deploys straight to the public site, so production often runs
untagged builds whose checksums aren't published, and real-device checks (two devices on
different networks) have no URL to run against before users get the change.
**Proposal:** production deploys only from release tags; a separate staging repository (Pages
serves one site per repository) pulls `main` from this public repository, builds it in the same
container and serves it at its own address, with no write token, a "staging" banner, `noindex`
and its own Trystero `appId`.

## Self-hosted / white-label deployments
**Status:** 💡 Proposed. A sustainability option: own domain, relays and STUN/TURN for organisations.
