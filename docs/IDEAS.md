# Ideas under consideration

Nothing here is implemented. Each idea is recorded with its trade-offs so that decisions are
explicit and reviewable.

## 1. Usage statistics without cookies, trackers or new risks

**Hard constraint:** no third-party JavaScript may ever run on the app's pages. Any script running
there can read `location.hash`, which contains room secrets. This rules out Google Analytics,
Plausible's script, Cloudflare Web Analytics' beacon, and similar tools. The CSP blocks them anyway.

Options that keep that guarantee, from least to most invasive:

| Option | What you learn | Privacy cost | Notes |
|---|---|---|---|
| **Static host access logs** | Page loads per day and module loads per tool (`/src/tools/chat.js` = someone opened Chat) | None beyond what the host already sees. The fragment is never sent | Zero code. Cloudflare and Netlify show aggregate counts. **Recommended first step.** |
| **Count module loads on our own origin** | Per-tool usage (`chat.js`, `share.js`, `password.js`) | Same as above | Works because the router lazily loads per-tool code (needs the split described in §4) |
| **Anonymous event counter** | e.g. "room created", "share delivered" | One request per event to an endpoint we run (e.g. a Cloudflare Worker that only increments a counter: no IP, no body, no identifier) | Must be **opt-in** or at least documented in a privacy note. The CSP needs `connect-src` for that one origin. Use `navigator.sendBeacon` with an empty body |
| **"+1 / This was useful" button** | Explicit appreciation, a portfolio signal | One request when clicked, by choice | Can live **outside** the app (README badge, project page), e.g. a GitHub star or a counter image on the landing page. Nothing changes in the app |

Recommendation: start with access logs and a "+1" on the project or landing page, not inside the
tools. Add the anonymous counter later only if needed, behind a clear privacy note.

## 2. Monetisation and visibility

- **Portfolio / visibility:** a public repository with this documentation, a short write-up of
  the threat model and protocol (blog post), a demo video, a GitHub star counter.
- **Donations:** GitHub Sponsors or Ko-fi links in the README and footer. These are links only,
  with no embedded widgets.
- **Paid add-ons that don't weaken the model:**
  - an optional **TURN relay** service for users behind strict NATs (it only carries
    already-encrypted data);
  - **self-hosted / white-label** deployments for companies (own domain, own relays, own STUN/TURN);
  - support and security-review packages.
- Never: ads, trackers, or a "pro" tier that changes the security properties.

## 3. Local AI to make passphrases more memorable

The idea: give a local model the randomly chosen words and ask for a memorable phrase or for word
variations.

Assessment:
- **Where the entropy comes from is what matters.** A language model's output is predictable and
  biased. If the model *chooses* or *changes* the words that make up the password, the strength
  becomes "whatever the model tends to write", which is much lower and impossible to measure.
- **Safe use:** the CSPRNG chooses everything that ends up in the password, words and variations
  alike. The model only writes a **memory aid**, such as a one-line story using those exact words,
  shown next to the password and never part of it. Strength stays exactly what we compute.
- **Leakage:** only a **local** model is acceptable, e.g. Chrome's built-in Prompt API (Gemini
  Nano) or a local Ollama. A cloud API would receive the password. Local runtimes may keep caches
  or logs: Chrome's built-in model doesn't persist prompts, while Ollama keeps none by default but
  third-party front-ends might. Exploiting a local cache requires access to the device, which is
  already out of scope.
- **Verdict:** reasonable as an optional "help me remember" button that uses on-device models only
  and never modifies the password. Low priority.

## 4. Product structure: three apps and a shared library

Proposed layout once a build step is accepted:

```
packages/
  core/         random, encoding, crypto, room protocol (no DOM)
  passphrase/   generator + <passphrase-generator> web component (embeddable widget)
apps/
  share/        Secure Share
  chat/         Secure Chat
  password/     Password generator page (uses the widget)
```

- The passphrase generator as a **web component** can be embedded anywhere with one `<script>`
  plus one tag, without exposing the other tools.
- Separate apps mean separate origins are possible (e.g. `share.example`, `chat.example`), which
  isolates storage and limits the impact of a bug in one app.
- Can be done without a bundler by publishing ES modules, but npm publishing and the widget
  benefit from a small build step (esbuild or Vite library mode).

## 5. TypeScript

| Option | Pros | Cons |
|---|---|---|
| Plain JS (today) | No build; served code is the reviewed code | No type checking; protocol message shapes are implicit |
| **JS + JSDoc types + `tsc --checkJs` in CI** | Type safety and editor help, **still no build step**, served code unchanged | Types written in comments, slightly verbose |
| Full TypeScript | Best tooling, explicit protocol types | Build step, so served code ≠ reviewed code (source maps help); needs Node locally |

Recommendation: **JSDoc + `checkJs` now**, especially to type the protocol messages in
`room.js`. Move to full TypeScript if and when the project is split into packages (§4), since that
step introduces a build anyway.

## 6. Cryptographic construction review (protocol, not primitives)

Primitives are all Web Crypto. Possible ways to lean even more on vetted constructions:

| Area | Current | Vetted alternative | Trade-off |
|---|---|---|---|
| Passphrase authentication | PBKDF2 + HMAC challenge-response (online-only guessing) | A **PAKE** (CPace, SPAKE2, OPAQUE) | Stronger against weak passphrases, but no mature, maintained browser library today; would add a dependency |
| Channel / handshake | Custom handshake inside DTLS | **Noise** pattern (e.g. `XXpsk3`) | Well analysed, but needs a library and duplicates DTLS's encryption |
| Share payload format | AES-GCM blobs | **age** format (`typage`) | Standard, interoperable, audited format; adds a dependency |
| Group messaging | Static group key + signatures | **MLS** (RFC 9420) | Forward secrecy, post-compromise security, member authentication without trusting the host. Heavy (WASM) |
| Key stretching | PBKDF2 600k | **Argon2id** (`hash-wasm`) | Memory-hard, so it resists GPU attacks better. Only matters if an offline attack becomes possible, which the design avoids |

Recommendation: keep Web Crypto primitives; get an external review of `PROTOCOL.md`; consider
`age` for Share (small, clear win) and MLS only if group chat becomes a primary feature.
