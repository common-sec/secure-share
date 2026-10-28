// Runs inside the page: one format, one size, timed. Driven by run-bench.mjs.
import { formats, setSevenZipOptions } from './formats.js';
import * as age from 'age-encryption';
import * as openpgp from 'openpgp';

setSevenZipOptions({ locateFile: (p) => p }); // 7zz.wasm is served next to the page

const PASS = 'quiet tundra mosaic lantern ripple orbit';
let input;

let blob;
window.makeInput = (mb, asBlob) => {
  if (asBlob) { // built from 1 MiB parts, so no whole in-memory copy stays behind
    const parts = [];
    for (let i = 0; i < mb; i++) {
      const part = new Uint8Array(1024 * 1024);
      for (let j = 0; j < part.length; j += 65536) crypto.getRandomValues(part.subarray(j, j + 65536));
      parts.push(new Blob([part]));
    }
    blob = new Blob(parts);
    return blob.size;
  }
  input = new Uint8Array(mb * 1024 * 1024);
  for (let i = 0; i < input.length; i += 65536) crypto.getRandomValues(input.subarray(i, i + 65536));
  return input.length;
};

const time = async (fn) => { const t = performance.now(); const r = await fn(); return [performance.now() - t, r]; };

// Whole file in memory, as the viewer needs it.
window.inMemory = async (name) => {
  const f = formats.find((x) => x.name === name);
  const [kdfMs] = await time(() => f.encrypt(new Uint8Array(1), PASS));
  const [encMs, enc] = await time(() => f.encrypt(input, PASS));
  const [decMs, dec] = await time(() => f.decrypt(enc, PASS));
  const ok = dec.length === input.length && dec[12345] === input[12345] && dec[dec.length - 1] === input[input.length - 1];
  return { kdfMs, encMs, decMs, overhead: enc.length - input.length, ok };
};

async function drain(stream) {
  let n = 0;
  for (const reader = stream.getReader(); ;) {
    const { done, value } = await reader.read();
    if (done) return n;
    n += value.length;
  }
}

// Streaming from a Blob to nowhere: what saving to disk (or a file picker) would cost in memory.
window.streaming = async (name) => {
  if (name === 'age') {
    const e = new age.Encrypter(); e.setPassphrase(PASS);
    const [encMs, n] = await time(async () => drain(await e.encrypt(blob.stream())));
    return { encMs, out: n };
  }
  if (name === 'openpgp (gpg-compatible)') {
    const [encMs, n] = await time(async () => {
      const message = await openpgp.createMessage({ binary: blob.stream() });
      return drain(await openpgp.encrypt({ message, passwords: [PASS], format: 'binary', config: { aeadProtect: false } }));
    });
    return { encMs, out: n };
  }
  return null;
};
window.ready = true;
