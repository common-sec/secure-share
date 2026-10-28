# File format spike (0.12.0 Encrypted files)

Throwaway code that compares `age` (`age-encryption`), OpenPGP (`openpgp`) and 7z (`7z-wasm`) for
the encrypted files tool. **The app doesn't use it**, and it isn't part of the build or CI.
Results and the recommendation: [docs/reviews/2026-10-28-file-format-spike.md](../../docs/reviews/2026-10-28-file-format-spike.md).

| File | What it does |
|---|---|
| `formats.js` | The candidates behind one interface (passphrase, plus public keys where the format has them) |
| `interop.test.js` | Library ↔ reference CLI round trips (`age`, `gpg`, `7z`), wrong passphrase, flipped byte |
| `pty-pass.py` | Types a passphrase into the `age` CLI, which only reads it from a terminal |
| `bench-page.js`, `bench.html`, `run-bench.mjs` | Speed and memory in Chromium, one fresh browser per measurement |

```bash
cd prototypes/file-formats
npm ci
node --test interop.test.js                    # needs age, age-keygen, gpg, 7z on the PATH
npx esbuild bench-page.js --bundle --format=esm --platform=browser --external:module --outfile=dist/bench.bundle.js
cp bench.html node_modules/7z-wasm/7zz.wasm dist/
node run-bench.mjs 100                         # MB; needs Playwright with Chromium
```
