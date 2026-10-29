# Development environment

**All development, testing and scanning happens in containers.** Nothing is installed on the host
besides a container engine, so a malicious dependency or tool can only reach the project folder,
not the rest of your machine.

## Requirements

Docker Engine with Compose v2. On Windows, Docker inside WSL2 (Ubuntu) works. The project is
reached from WSL at `/mnt/c/...`.

```bash
bash scripts/setup-docker-wsl.sh --check          # read-only: what's installed, what's missing
bash scripts/setup-docker-wsl.sh --compose-only   # keep the distro's Docker, add Compose + Buildx
bash scripts/setup-docker-wsl.sh                  # full rootless Docker install (recommended)
```

Prefer **rootless Docker**: its daemon runs as your user, not root. With the classic root daemon,
membership of the `docker` group is equivalent to root on that machine (or WSL distro).

## Everyday commands

Run from the repository root (in WSL on Windows):

| Command | What it does |
|---|---|
| `docker compose run --rm build` | `npm ci`, type-check, build `dist/` and check a second build is byte-identical |
| `docker compose up web` | Serve the built app (`dist/`) at http://127.0.0.1:8080 |
| `docker compose run --rm dev` | Shell in the Node dev image (npm, scripts) |
| `docker compose run --rm test-unit` | Unit tests in Chromium, Firefox and WebKit, **no network** (see [TESTING.md](TESTING.md)) |
| `docker compose run --rm test-e2e` | End-to-end tests of `dist/` through the real UI, local relay, **third-party requests blocked** |
| `docker compose run --rm test-e2e-public` | End-to-end tests over the real public relays and STUN |
| `docker compose run --rm lighthouse` | Lighthouse budgets (performance, accessibility, best practices, SEO) on every page of `dist/`, **no network** (see [TESTING.md](TESTING.md#lighthouse-budgets)) |
| `docker compose run --rm trufflehog` | Secrets in the working tree and in every commit of git history |
| `docker compose run --rm semgrep` | Static analysis (TypeScript, JavaScript, Python, Dockerfile, security audit) |
| `docker compose run --rm trivy` | Vulnerable dependencies, misconfigurations, secrets |

Run `build` first after changing `src/`: the web server, both test suites and Lighthouse use its output.
CI (`.github/workflows/ci.yml`) runs exactly these commands.

## The build

Sources are TypeScript in `src/` (strict mode). `build.mjs` uses esbuild to produce:

- `dist/`: the site as served: one pre-rendered page per tool and content page (`index.html`,
  `chat/`, `passwords/`, `how-it-works/`, `faq/`, from `src/pages/` by `pages.mjs`), `styles.css`,
  `app.js` and lazily loaded chunks (Trystero and its dependencies are bundled in, so nothing is
  fetched from a CDN), the icons and social image (`assets/site/`), `site.webmanifest`,
  `robots.txt`, `sitemap.xml`, plus `SHA256SUMS`. GitHub Pages serves this folder.
- `build/modules/`: every source module transpiled one-to-one, for the unit tests.

The build stamps the version (`package.json` version + short commit, read from `.git` or
`$BUILD_COMMIT`) into the app's footer. `npm run build:check` builds twice and fails if the
checksums differ; see [RELEASES.md](RELEASES.md) for verifying a published release.

### Deploying your own copy

The app is static: build it and serve `dist/` from any web server. The footer links the version
to its commit in `$BUILD_REPOSITORY`, by default `https://github.com/common-sec/secure-share`.
Point it at your own source when you deploy a fork or a modified copy (an `https://` URL; the
link is `<repository>/commit/<hash>`):

```bash
BUILD_REPOSITORY=https://github.com/you/secure-share docker compose run --rm build
```

Set `$BUILD_SITE_URL` to your copy's public address too (default `https://share.common-sec.org/`):
canonical URLs, link previews, `robots.txt` and `sitemap.xml` use it. Every other link in the
pages is relative, so the site works at a domain root or in a subfolder.

The Pages and Release workflows set it to the repository they run in, so a fork on GitHub links
to itself with no change.

## How it's put together

- **Two small images are built** from `Dockerfile`:
  - `dev`: the official Node image and its non-root `node` user, for npm and scripts;
  - `test`: Microsoft's Playwright image (browsers) plus the hash-pinned Python test packages,
    installed **at build time** under `pip.conf`'s rules. Test runs then need no install step and
    no network, and the image is rebuilt only when the pins change.
- **Everything else is an official image used as-is**, declared in `compose.yaml` and pinned
  there by tag and digest: Python (serves the app), TruffleHog, Semgrep, Trivy. Each tool runs in
  its own container.
- **Every container is hardened the same way:**
  - non-root user;
  - no Linux capabilities (`cap_drop: ALL`) and `no-new-privileges`;
  - read-only root filesystem, with only `/tmp` writable;
  - the project mounted **read-only**, except for `dev`, and `.cache/` for Trivy's database;
  - unit tests and TruffleHog run with **no network at all** (TruffleHog with
    `--no-verification`, so found secrets are never sent to their providers to check them);
  - `HOME` points at the writable `/tmp`, because tools keep settings and caches there (e.g.
    Semgrep's rule cache) while what they *scan* is the read-only `/work`;
  - the web server is published on `127.0.0.1` only.
- **No Docker-in-Docker**, no Docker socket mounted anywhere.

## Pinning and supply-chain rules

| What | Pinned by | Hardening | Updated by |
|---|---|---|---|
| Dev base image | Tag + digest in `Dockerfile` | Non-root | Dependabot (`docker`) |
| Test base image | Tag + digest in `Dockerfile` | Non-root (`pwuser`) | Dependabot (`docker`) |
| Tool images | Tag + digest in `compose.yaml` | Non-root, no caps, read-only | Dependabot (`docker-compose`) |
| Python test packages | Exact version + SHA-256 of every file, the whole tree (`tests/requirements.txt`), installed when the `test` image is built | `pip.conf`: `require-hashes`, wheels only (no build code runs), uploaded ≥ 7 days ago | Dependabot (`pip`) |
| npm packages (Trystero, esbuild, TypeScript) | `package.json` exact versions + `package-lock.json` integrity hashes, installed with `npm ci` | `.npmrc`: `ignore-scripts`, `min-release-age=7`, `save-exact`, `engine-strict` | Dependabot (`npm`) |
| GitHub Actions | Commit SHA | `persist-credentials: false`, read-only token | Dependabot (`github-actions`) |

All of these use a **7-day minimum age**: npm `min-release-age=7`, pip
`uploaded-prior-to = P7D`, and a Dependabot `cooldown` of 7 days. A freshly published malicious
release usually gets detected and pulled within days, so it never reaches us. Security updates
aren't delayed.

All image digests are **multi-platform indexes** (at least `linux/amd64` and `linux/arm64`), so
the same pins work on Intel and Apple Silicon Macs, Windows (WSL2) and Linux. Docker picks the
matching platform's image from the pinned index.

### Updating a pin by hand

Normally Dependabot does it. To do it manually, pick a version at least 7 days old and take its
digest from the registry:

```bash
docker buildx imagetools inspect node:24.20.0-bookworm-slim --format '{{json .Manifest.Digest}}'
```

Python packages: update the version and **all** `--hash` lines in `tests/requirements.txt`. The
hashes are listed on each release's PyPI page, or generate them with `pip download` / `pip hash`
inside a container.

## Why not …

- **Dev containers (VS Code)**: they typically rely on Docker-in-Docker or a mounted Docker
  socket, which gives the container control over the host's Docker.
- **mise**: good at pinning tools *on the host*, but we don't install tools on the host. Image
  digests already pin every tool, and mise's OCI backend is still experimental.
- **One big image with every tool**: harder to audit and update, and every tool would share one
  attack surface. Separate official images are smaller, independently pinned and independently
  updated.
