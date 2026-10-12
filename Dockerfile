# Development image: Node.js + npm, for working on the app (npm ci, builds, scripts).
# Pinned by digest; runs as the image's built-in non-root `node` user (uid 1000).
# Tests and scanners don't use this image: they run their official images (see compose.yaml).
FROM node:24.20.0-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /work
USER node
CMD ["sh"]
