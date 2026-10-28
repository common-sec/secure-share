#!/bin/sh
# Builds the prototype twice: pkg/ is what the app would ship, pkg-vectors/
# adds the fixed-ephemeral entry points the test vectors need.
set -eu
cd "$(dirname "$0")"
cargo build --release
wasm-bindgen --target web --out-dir pkg target/wasm32-unknown-unknown/release/noise_wasm.wasm
cargo build --release --features test-vectors --target-dir target/vectors
wasm-bindgen --target web --out-dir pkg-vectors target/vectors/wasm32-unknown-unknown/release/noise_wasm.wasm
for f in pkg/noise_wasm_bg.wasm pkg/noise_wasm.js; do
  printf '%s: %s bytes, %s gzipped\n' "$f" "$(wc -c < "$f")" "$(gzip -9c "$f" | wc -c)"
done
