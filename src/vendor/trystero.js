// Single place where the third-party P2P library is pulled in, pinned to an exact version.
// Trystero: serverless WebRTC matchmaking (MIT) — https://github.com/dmotz/trystero
// To self-host instead of using the CDN, drop the bundled file next to this one and change the URL.
export const TRYSTERO_URL = 'https://cdn.jsdelivr.net/npm/trystero@0.26.0/+esm';

export function loadTrystero() {
  return import(TRYSTERO_URL);
}
