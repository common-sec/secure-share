# UX, product and SEO review: 2026-10-12

Reviewed: the live site (https://gum0x.github.io/user-sec-tools/, v0.4.1) on desktop and on a
375 × 812 phone viewport. Covered: the full Secure Share flow (sender and recipient), Secure Chat's
landing page, the password generator, the HTML that crawlers and link previews see, and the files
search engines look for.

**Overall:** the core works and the security story is strong. A real share went through
end-to-end in about 10 seconds. The product is not yet ready to be **found**, **trusted at first
sight**, or **used comfortably on a phone**. Most fixes are small; the biggest are SEO
(the pages are empty without JavaScript) and a clear name and identity.

---

## 1. Product and positioning

| Finding | Why it matters | Recommendation |
|---|---|---|
| Three near-identical names: *Secure Sharing* (app), *Secure Share*, *Secure Chat* | Hard to remember, hard to search for, generic (many products use these words) | One distinctive umbrella name; the tools keep plain descriptive names ("Share", "Chat", "Passwords") |
| No logo or favicon (the browser shows a blank tab icon; `/favicon.ico` → 404) | Looks unfinished; tabs and bookmarks are anonymous | Logo + favicon set (see §5) |
| The unique strengths aren't stated up front: nothing stored anywhere, no account, works across any network, needs **two** secrets (link + passphrase), open source | These are the reasons to choose it over email, chat apps or one-time-secret services | A one-line promise plus three proof points above the form; a comparison table on a "How it works" page |
| Recipients can't tell who or what this is | A stranger's link that asks for a passphrase looks like phishing | A recipient page that explains the tool, links to the source code and "How it works", and states what will happen |
| The app is hosted under a personal account (`gum0x.github.io/user-sec-tools`) | Reads as a personal project; the URL is long and not brandable | A dedicated organisation, whose name gives a clean `<org>.github.io` address (§6) |

## 2. UX: Secure Share (the main flow)

### Sender
| # | Finding | Severity | Recommendation |
|---|---|---|---|
| S1 | On a phone, **if the screen locks or the user switches apps, the share dies** (the sender must stay online), and nothing prevents it | High | Request a Screen Wake Lock while waiting; warn when the tab goes to the background; explain this before creating the link |
| S2 | The link is 163 characters and can only be copied | High | A "Send link…" button using the system share sheet (Web Share API); a QR code for handing it to a phone nearby; "Copy invitation" text that reminds people to send the passphrase **another way** |
| S3 | The main button sits below the first screen on a phone (button at y = 971 px, screen height 812 px) | Medium | Shorter intro (details move to a "How it works" disclosure), smaller default text area, a sticky primary button on mobile |
| S4 | The intro text repeats on the waiting screen | Low | Hide the intro once the link exists; focus on the steps and status |
| S5 | No signal when delivery happens while the tab isn't visible | Medium | Update the tab title ("✓ Delivered"), and optionally a notification if the user allows it |
| S6 | "Fair · ≈57 bits of entropy" is jargon; "Fair" alarms people even with the explanation | Medium | Plain language: "Strong enough for this room ✓", with "≈57 bits" as detail on demand |
| S7 | "Ask me before delivering" is unclear | Low | "Let me check who's receiving before sending (compare a code by phone)" |

### Recipient
| # | Finding | Severity | Recommendation |
|---|---|---|---|
| R1 | No context or trust signals: just "Someone sent you a one-time, end-to-end encrypted delivery" and a passphrase box | High | Explain what this is, that it's open source, what happens next, and that nothing is stored; add a "How it works" link |
| R2 | The received secret is shown **in plain text**, though secrets are masked everywhere else | High | Mask by default with Show; add "Copy" and "Clear from screen" |
| R3 | Tab title still says "Share once" | Low | "You've received a secure delivery" |
| R4 | No next step after receiving | Low | "Send something back securely" (opens a new share), "Done" (clears everything) |
| R5 | When the sender is gone, the recipient waits 20 s before getting a hint | Medium | Show the connection stages live (finding sender, connecting, receiving %), and after a timeout give actionable advice (ask the sender to keep the page open, try another network) |

## 3. UX: Secure Chat and Passwords

- Chat's landing page is clear. The three facts ("link + passphrase", "host approves", "safety
  codes") work well; keep them, with plain-language "Why?" links.
- Passwords: the lead "Generated locally with `crypto.getRandomValues`" is developer language. Say
  "Generated on your device. Nothing is sent anywhere." and put the technical detail in a disclosure.
- Passwords: the strength meter needs the same plain-language treatment as S6.

## 4. Accessibility (quick pass; a full audit belongs in the e2e tests with axe-core)

- The message `<textarea>` has a visible label that isn't associated with it, so screen readers
  don't announce it.
- Tap targets under 44 px: navigation (36 px), "choose files" (30 px), inline links (20 px), and
  the logo link (24 px).
- Status changes (connecting, delivered) should use `aria-live` consistently. Chat does; Share
  only partly.
- To check: colour contrast of the muted text in both themes, and visible keyboard focus everywhere.

## 5. Name and logo

**Naming criteria:** short and pronounceable in several languages; says *private handover* rather than
"generic security"; free as a GitHub organisation (because `<org>.github.io` becomes the address);
no obvious clash with an existing product. A trademark and domain check is still needed before
deciding.

Candidates free as GitHub organisations on 2026-10-12:

| Name | Idea |
|---|---|
| **Handseal** | Hand something over, sealed. Fits Share; works as an umbrella (Handseal Share / Chat / Passwords) |
| **Doublelock** | Two keys are needed: the link *and* the passphrase. Explains the security model in one word |
| **Peerseal** | Peer-to-peer + sealed; slightly technical |
| **Burnlink** | The link burns after use. Strong for Share, weaker as an umbrella for Chat |
| **Whisperlink** | Friendly, privacy-flavoured; longer |

Taken as GitHub names (unless acquired): twokeys, sealdrop, hushdrop, oncelink, passdrop, sealshare.

**Logo direction:** a simple mark that works at 16 px. Ideas: two keys forming a shape (link +
passphrase); a sealed envelope crossing a line between two dots (browser to browser); a wax-seal
outline. Deliver as SVG (favicon, header), PNG sizes for `apple-touch-icon` and the manifest, and a
1200 × 630 social preview image.

## 6. Organisation and hosting

Moving to a dedicated GitHub organisation (e.g. `handseal`), **before announcing**, because the
public URL changes:

- **Security:** require 2FA for all members, apply organisation-wide rulesets (protected `main`,
  required reviews, signed commits), run Allstar policies, keep an audit log, and separate the
  project from the personal account, so a compromise of one doesn't hand over the other.
- **Continuity:** several owners, teams and a clear governance file, so the project outlives one maintainer.
- **Address:** a repository named `<org>.github.io` serves at the root, `https://<org>.github.io/`,
  which is short and brandable and still free. A custom domain can come later (it costs money).
- **Move:** `gh api repos/gum0x/user-sec-tools/transfer -f new_owner=<org>`. GitHub redirects the
  repository URL, but **the old Pages URL doesn't redirect**. That's fine now, since nothing has been announced.
- **Hosting stays static.** GitHub Pages is free and sends HSTS. Its limits (no custom headers, no
  visitor statistics) are recorded in IDEAS. A local version is on the roadmap.

## 7. SEO and discoverability

What a crawler or link preview currently gets:

| Check | Now | Needed |
|---|---|---|
| Page content without JavaScript | **Empty** (`<main>` has no content; many crawlers and **every** link preview see nothing) | Static, pre-rendered content in the HTML; JavaScript enhances it |
| Indexable pages | **1**: `#/chat` and `#/password` are fragments, which search engines ignore | Real paths: `/`, `/chat/`, `/passwords/`, `/how-it-works/`, `/faq/` (room secrets stay in the fragment) |
| Title | "Share once · Secure Sharing" | Keyword-led: "Send passwords & files securely, browser to browser · <Name>" |
| Meta description | Missing | ~150 characters per page |
| Open Graph / Twitter card | Missing | Title, description, 1200 × 630 image. Shared room links then show a trustworthy preview, and **never** the secret, because previews don't receive the fragment |
| Canonical URL | Missing | One per page |
| Favicon / touch icon / manifest / theme colour | Missing (404) | Full set |
| `robots.txt` / `sitemap.xml` | Missing (404) | Both |
| Structured data | None | `WebApplication` + `FAQPage` JSON-LD (data only, nothing executes) |
| Content depth | ~190 words on the home page | A "How it works" page, an FAQ ("Is it safe to send passwords this way?", "What if the recipient is offline?"), and comparisons (email, chat apps, one-time-secret sites) |
| Language | `lang="en"` ✓ | Later: Spanish and other translations (`hreflang`) |
| HTTPS / HSTS | ✓ (GitHub) | |
| Speed | Excellent: about 1 KB of HTML, no frameworks | Keep it; track it with Lighthouse CI |

**Searches to target:** send password securely · share sensitive files securely · encrypted file
transfer without upload · one-time secret link · peer-to-peer file sharing in the browser · share
a password with a colleague.

**Privacy-friendly measurement:** Google Search Console and Bing Webmaster Tools (verified with a
meta tag or DNS) report search impressions and clicks **without any script on the page**. This
is the metric source that fits "no trackers".

**Launch channels** (once SEO and trust signals are in place): Show HN, r/privacy and r/netsec,
Product Hunt, AlternativeTo, and submissions to privacy tool directories (they usually require
open source and an audit, which the roadmap already plans).

---

## 8. Proposed roadmap changes

1. **Name, logo and organisation** first: the URL changes, so it must happen before anything is announced or indexed.
2. **Sending and receiving UX**: S1–S7, R1–R5, the accessibility basics, plain language.
3. **SEO and launch readiness**: static pre-rendered pages, metadata, social preview, sitemap,
   How it works and FAQ, Search Console, Lighthouse CI.
4. Then the existing plan (end-to-end tests, TypeScript build, …). End-to-end tests come after
   the UX rework so they test the final flows, and they gain automated accessibility checks.
