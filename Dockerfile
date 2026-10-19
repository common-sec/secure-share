# Two small images; everything else in compose.yaml is an official image used as-is.
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
FROM mcr.microsoft.com/playwright/python:v1.64.0-noble@sha256:684df257a1fa0ef3fa288239819984008f560e8f8db5b635ee9e2a50cbcd2e23 AS test
COPY pip.conf tests/requirements.txt /tmp/deps/
RUN PIP_CONFIG_FILE=/tmp/deps/pip.conf pip install --no-cache-dir --target /opt/pydeps -r /tmp/deps/requirements.txt \
 && rm -rf /tmp/deps
ENV PYTHONPATH=/opt/pydeps \
    PYTHONDONTWRITEBYTECODE=1
WORKDIR /work
USER pwuser
CMD ["python", "tests/unit/run.py", "chromium", "firefox", "webkit"]
