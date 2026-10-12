#!/bin/sh
# Project-specific checks that generic scanners don't know about. POSIX sh (runs in any container).
set -u
status=0

echo "-- only reviewed external URLs in shipped code"
# Any new external URL in index.html or src/ must be reviewed and added here on purpose.
allowed='https://cdn\.jsdelivr\.net(/npm/trystero@0\.26\.0/\+esm)?;?$|https://github\.com/dmotz/trystero$'
found=$(grep -rnoE "https?://[^'\" )>]+" index.html src | sed -E 's/^[^:]+:[0-9]+://' | grep -vE "$allowed" || true)
if [ -n "$found" ]; then echo "$found"; echo "FAIL: unexpected external URL"; status=1; else echo "ok"; fi

echo "-- no innerHTML / eval / new Function in shipped code"
found=$(grep -rnE "innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function\(" src | grep -vE ':[0-9]+:[[:space:]]*//' || true)
if [ -n "$found" ]; then echo "$found"; echo "FAIL: unsafe DOM/code API"; status=1; else echo "ok"; fi

echo "-- every Docker base image pinned by digest"
found=$(grep -nE '^FROM ' Dockerfile | grep -v '@sha256:' || true)
if [ -n "$found" ]; then echo "$found"; echo "FAIL: unpinned base image"; status=1; else echo "ok"; fi

echo "-- every compose image pinned by digest"
# Allowed without a digest: the locally built dev image, and YAML aliases (*name) to a pinned one.
found=$(grep -nE '^[[:space:]]+image:' compose.yaml | grep -vE '@sha256:[0-9a-f]{64}|image: user-sec-tools/|image: \*' || true)
if [ -n "$found" ]; then echo "$found"; echo "FAIL: unpinned compose image"; status=1; else echo "ok"; fi

echo "-- pip hardening settings present"
missing=""
for setting in 'require-hashes = true' 'only-binary = :all:' 'uploaded-prior-to = P7D'; do
  grep -qx "$setting" pip.conf || missing="$missing [$setting]"
done
if [ -n "$missing" ]; then echo "FAIL: pip.conf is missing:$missing"; status=1; else echo "ok"; fi

echo "-- every GitHub Action pinned by commit SHA"
found=$(grep -rnE 'uses: ' .github/workflows | grep -vE 'uses: [^@]+@[0-9a-f]{40}' || true)
if [ -n "$found" ]; then echo "$found"; echo "FAIL: action not pinned to a commit SHA"; status=1; else echo "ok"; fi

echo "-- npm hardening settings present"
missing=""
for setting in 'ignore-scripts=true' 'min-release-age=7'; do
  grep -qx "$setting" .npmrc || missing="$missing $setting"
done
if [ -n "$missing" ]; then echo "FAIL: .npmrc is missing:$missing"; status=1; else echo "ok"; fi

exit $status
