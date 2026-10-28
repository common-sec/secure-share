// Two peers in one page, as the guest and the host would run.
import init, { Handshake, generate_keypair } from '../pkg/noise_wasm.js';

const enc = new TextEncoder();
const dec = new TextDecoder();
const split = (kp) => ({ priv: kp.slice(0, 32), pub: kp.slice(32) });

try {
  const t0 = performance.now();
  await init();
  const loadMs = performance.now() - t0;
  const host = split(generate_keypair());
  const guest = split(generate_keypair());
  const psk = crypto.getRandomValues(new Uint8Array(32));
  const prologue = enc.encode('commonsec-share noise prototype');
  const t1 = performance.now();
  const g = Handshake.initiator(1, guest.priv, host.pub, psk, prologue);
  const h = Handshake.responder(1, host.priv, psk, prologue);
  h.read_message(g.write_message(new Uint8Array(0)));
  g.read_message(h.write_message(new Uint8Array(0)));
  const handshakeMs = performance.now() - t1;
  const gt = g.into_transport();
  const ht = h.into_transport();
  const chunk = crypto.getRandomValues(new Uint8Array(65535 - 16));
  const t2 = performance.now();
  for (let i = 0; i < 160; i++) ht.decrypt(gt.encrypt(chunk));
  const mbps = (160 * chunk.length) / 1e6 / ((performance.now() - t2) / 1000);
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const t3 = performance.now();
  for (let i = 0; i < 160; i++) {
    const iv = new Uint8Array(12);
    new DataView(iv.buffer).setUint32(8, i);
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, chunk));
  }
  const webCryptoMbps = (160 * chunk.length) / 1e6 / ((performance.now() - t3) / 1000);
  const echo = dec.decode(gt.decrypt(ht.encrypt(enc.encode('hello guest'))));
  window.result = { ok: echo === 'hello guest', loadMs: Math.round(loadMs), handshakeMs: +handshakeMs.toFixed(1), wasmMBps: Math.round(mbps), webCryptoAesGcmMBps: Math.round(webCryptoMbps) };
} catch (e) {
  window.result = { ok: false, error: String(e) };
}
