# Three small images; everything else in compose.yaml is an official image used as-is.
# Base images are pinned by tag (for humans and Dependabot) and digest (what actually runs). The
# digests are multi-platform indexes, so the same pin works on amd64 and arm64 (e.g. Apple Silicon).

# ---- dev: Node.js + npm, for working on the app ------------------------------------------------
FROM node:24.20.0-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e AS dev
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /work
USER node
CMD ["sh"]

# ---- test: Playwright browsers + the hash-pinned Python test packages -------------------------
# Microsoft's image ships the browsers but not the Python package. Installing it here, at build
# time, under pip.conf's rules (hashes required, wheels only, >= 7 days old) bakes the exact
# pinned versions into the image: test runs need no install step and no network.
FROM mcr.microsoft.com/playwright/python:v1.63.0-noble@sha256:72bd171a9ffc2b4b59532aaa6210e21014d07093120dc25528870c0b840da1f0 AS test
COPY pip.conf tests/requirements.txt /tmp/deps/
RUN PIP_CONFIG_FILE=/tmp/deps/pip.conf pip install --no-cache-dir --target /opt/pydeps -r /tmp/deps/requirements.txt \
 && rm -rf /tmp/deps
ENV PYTHONPATH=/opt/pydeps \
    PYTHONDONTWRITEBYTECODE=1
WORKDIR /work
USER pwuser
CMD ["python", "tests/unit/run.py", "chromium", "firefox", "webkit"]

# ---- lighthouse: Lighthouse budgets on the built site (tools/lighthouse/run.mjs) ---------------
# Microsoft's Playwright image again (same version as `test`), for its Node and Chromium.
# Lighthouse is installed from its own lockfile under the root .npmrc rules (no install scripts,
# >= 7 days old), into /opt/lighthouse; run.mjs finds it through LIGHTHOUSE_MODULES.
FROM mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27 AS lighthouse
COPY .npmrc tools/lighthouse/package.json tools/lighthouse/package-lock.json /opt/lighthouse/
RUN cd /opt/lighthouse && npm ci --no-audit --no-fund && npm cache clean --force
ENV LIGHTHOUSE_MODULES=/opt/lighthouse
WORKDIR /work
USER pwuser
CMD ["node", "tools/lighthouse/run.mjs"]
