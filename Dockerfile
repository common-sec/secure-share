# Two small images; everything else in compose.yaml is an official image used as-is.
# Base images are pinned by tag (for humans and Dependabot) and digest (what actually runs). The
# digests are multi-platform indexes, so the same pin works on amd64 and arm64 (e.g. Apple Silicon).

# ---- dev: Node.js + npm, for working on the app ------------------------------------------------
FROM node:24.20.0-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e AS dev
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /work
USER node
CMD ["sh"]

# ---- age-cli: the reference age tool, for the interoperability check (tests/unit/age_cli.py) ----
# Built from source at an exact version: the Go module proxy serves it, and the Go checksum database
# (sum.golang.org) verifies it and every dependency before anything is compiled. v1.3+ reads the
# post-quantum hybrid recipients the app uses.
FROM golang:1.25.14-bookworm@sha256:3b4a11519ad929d1e1d261a12cff056f0c85b735253d7d861346b9c6f8b36437 AS age-cli
RUN CGO_ENABLED=0 GOTOOLCHAIN=local GOBIN=/out go install -trimpath filippo.io/age/cmd/age@v1.3.2

# ---- test: Playwright browsers + the hash-pinned Python test packages -------------------------
# Microsoft's image ships the browsers but not the Python package. Installing it here, at build
# time, under pip.conf's rules (hashes required, wheels only, >= 7 days old) bakes the exact
# pinned versions into the image: test runs need no install step and no network.
FROM mcr.microsoft.com/playwright/python:v1.63.0-noble@sha256:72bd171a9ffc2b4b59532aaa6210e21014d07093120dc25528870c0b840da1f0 AS test
COPY pip.conf tests/requirements.txt /tmp/deps/
RUN PIP_CONFIG_FILE=/tmp/deps/pip.conf pip install --no-cache-dir --target /opt/pydeps -r /tmp/deps/requirements.txt \
 && rm -rf /tmp/deps
COPY --from=age-cli /out/age /usr/local/bin/age
ENV PYTHONPATH=/opt/pydeps \
    PYTHONDONTWRITEBYTECODE=1
WORKDIR /work
USER pwuser
CMD ["sh", "-c", "python tests/unit/run.py chromium firefox webkit && python tests/unit/age_cli.py"]
