# Assessment: static HTML generation for SEO (2026-10-13)

**Question:** the app is a single-page application (SPA). Is that the right choice for SEO, or
should we generate static HTML?

**Short answer:** keep the tools as client-side JavaScript (they have to be: Web Crypto, WebRTC),
but **stop being a single page**. Generate one **static HTML page per tool and per content page**,
with real content in the HTML, and let JavaScript mount the interactive tool into it ("static
first, JavaScript enhances"). The simplest way, with no new dependency, is to extend the existing
`build.mjs`. Hugo is the fallback if content grows a lot (translations, many pages).

This assessment proposes a direction; it doesn't change the roadmap. If accepted, it becomes a
decision in `docs/DECISIONS.md` and shapes the "SEO and launch readiness" roadmap item.

---

## 1. What's wrong today

The [UX, product and SEO review](2026-10-12-ux-product-seo.md#7-seo-and-discoverability) found:

| Problem | Cause |
|---|---|
| Crawlers and link previews see an **empty page** | All content is rendered by JavaScript into an empty `<main>`. Google runs JavaScript (with delay and limits); most other crawlers and **every** link preview (WhatsApp, Slack, LinkedIn, X) don't |
| Only **one** indexable URL | Tools live in the fragment (`#/chat`, `#/password`), which search engines ignore |
| One title, one description for everything | A single `index.html` |

The tools themselves being JavaScript isn't the problem. The problem is that **the HTML contains
nothing**, and **every page shares one URL**.

## 2. Target shape

```
/                    Secure Share       static HTML: title, description, intro, how-it-works summary,
                                        FAQ excerpt; the share tool mounts into <div id="app">
/chat/               Secure Chat        same pattern
/passwords/          Password generator same pattern
/how-it-works/       content only       plain HTML, no app code needed
/faq/                content only       plain HTML (+ FAQPage structured data)
/robots.txt  /sitemap.xml  /favicon.svg  /site.webmanifest  /og-image.png
```

- Each page has its own `<title>`, meta description, canonical URL, and Open Graph/Twitter tags.
- **Secrets stay in the fragment**, which is never sent to a server or seen by a crawler or link
  preview:
  - Share: `/#r=…&k=…&h=…`
  - Chat: `/chat/#r=…&k=…&h=…`

  This drops the `#/tool?` prefix. It's a breaking change of the link format, harmless before the
  public announcement; old links can be redirected in JavaScript.
- Without JavaScript, every page still shows its content plus a clear "this tool needs
  JavaScript" notice.
- The same strict CSP on every page; no inline scripts are needed.
- GitHub Pages serves `/chat/index.html` at `/chat/` natively. Deployment moves from "branch root"
  to "upload `dist/` from Actions", which the TypeScript build needs anyway.

## 3. Options

| | How | New dependencies | Good at | Weak at |
|---|---|---|---|---|
| **A. Extend `build.mjs`** | Page templates (shared header/footer partials + per-page HTML) assembled by the existing build; esbuild still bundles the app | **None** | Reuses the reproducible build; auditors read one more short file; ideal for ~5–15 pages | Hand-rolled templating; Markdown content would need a parser (a dependency) or stays as HTML |
| **B. Eleventy (11ty)** | Node static site generator: Markdown + templates → HTML; the app bundle stays with esbuild | Dozens of npm packages (under our `.npmrc` rules) | Mature, flexible, good i18n plugin, stays in the JavaScript toolchain | Adds a sizeable dependency tree to audit and update |
| **C. Hugo** | Single Go binary, run from a **pinned official container**, like Trivy or Semgrep; Markdown content → HTML; the app bundle stays with esbuild and is copied in | **No npm packages** (one pinned image) | Very fast; built-in i18n, sitemap, robots, `hreflang`, image processing; strong supply-chain story | Go template syntax to learn; a second build step to wire up |
| **D. Astro** | Islands architecture, TypeScript-native, replaces our build | Hundreds of npm packages | Best developer experience; per-component hydration | Conflicts with the low-dependency principle; replaces the build just written |
| **E. Pre-render the SPA** | Snapshot each route with Playwright at build time | None (Playwright is already in the test image) | Keeps the SPA as is | Brittle; snapshots of dynamic UI; two sources of truth |

## 4. Recommendation

1. **Now: option A.** Turn `src/index.html` into a small set of page templates (shared
   head/header/footer + per-page content), and have `build.mjs` write `dist/<page>/index.html`
   for each page, plus `robots.txt`, `sitemap.xml` and the icons. The app's router reads the
   **path** for the tool and the **fragment** for the room secrets. No new dependency, and it fits
   the reproducible build and its `SHA256SUMS`.
2. **Later, if content grows** (translations, a blog, many comparison pages): **option C,
   Hugo**, from a pinned container, so still no npm packages. The page structure from step 1
   carries over: the templates become Hugo layouts.
3. **Not recommended:** D (dependency weight against our principles) and E (fragile).

## 5. Impact and timing

- **TypeScript build (in progress):** best to make `dist/` multi-page-ready now (e.g.
  `src/pages/`), so the build is designed once. This is a small change while the build is being
  written; it's larger afterwards.
- **Link format:** the new links (`/#r=…`, `/chat/#r=…`) should ship **before the public
  announcement**, together with the move to the organisation (the address changes anyway).
- **Tests:** the unit tests are unaffected. The end-to-end tests need the new URLs, and gain a
  "page works without JavaScript" check (content present) plus metadata checks per page.
- **Roadmap:** no change in this PR. If accepted:
  - a decision entry in `docs/DECISIONS.md` ("Static pages per tool, JavaScript enhances");
  - the "SEO and launch readiness" item references this assessment;
  - the TypeScript build item notes the multi-page `dist/` layout.
