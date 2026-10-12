# Ideas

Ideas live here until they are chosen for the [roadmap](ROADMAP.md). Anyone can add one.
Nothing here is being worked on unless the roadmap says so.

## Process

| Status | Meaning |
|---|---|
| 💡 Proposed | Written down, not decided |
| ✅ Accepted → vX.Y | Chosen; it now lives on the roadmap under that version |
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
**Status:** ✅ Accepted → 0.4.0, as part of the reproducible TypeScript build
**Problem:** jsDelivr serves the P2P library at runtime. Whoever serves the JS controls the app.
**Proposal:** commit a pinned build of Trystero to `src/vendor/`, record its checksum, and drop the CDN from the CSP.

## Type checking with JSDoc
**Status:** ❌ Rejected, superseded by full TypeScript with a reproducible build (0.4.0). Once
there's a build system for pinned dependencies anyway, TypeScript gives the same checks with less
noise. Reproducible builds keep "served code = reviewed code" verifiable.

## Support & feedback links
**Status:** ✅ Accepted → 0.5.0
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
**Status:** ✅ Accepted → 0.6.0
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

## Usage statistics from access logs
**Status:** 💡 Proposed
**Problem:** we don't know whether anyone uses the tools.
**Proposal:** read the static host's aggregate access logs (page and module loads). There's no
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
**Status:** ✅ Accepted → 0.4.0
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
**Status:** 💡 Proposed
**Proposal:** use the audited, standard `age` format (`typage`) for Share payloads instead of our
AES-GCM framing. One more dependency, but a standard and interoperable format.

## Group chat on MLS (RFC 9420)
**Status:** 🅿️ Parked: heavy (WASM). Only worth it if Chat becomes the primary product. It would
remove trust in the host for membership and add forward secrecy.

## PAKE for passphrase authentication (CPace / SPAKE2 / OPAQUE)
**Status:** 🅿️ Parked: no mature, maintained browser library today. The current design already
prevents offline guessing.

## Optional TURN relay
**Status:** 💡 Proposed
**Problem:** peers behind strict NATs or firewalls can't connect.
**Proposal:** an opt-in TURN server (self-hosted, or a paid service as a sustainability option). It
only carries data that is already end-to-end encrypted.

## End-to-end tests with real WebRTC
**Status:** 💡 Proposed
**Proposal:** Playwright with two browser contexts and a local Nostr relay in CI, so real WebRTC
and Trystero are exercised without public relays.

## Self-hosted / white-label deployments
**Status:** 💡 Proposed. A sustainability option: own domain, relays and STUN/TURN for organisations.
