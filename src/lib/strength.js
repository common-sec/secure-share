// Password strength: labels for a number of bits, and a conservative estimate for passphrases a
// person typed or edited (whose real entropy we can't know).
import { WORDS, WORD_SET } from './words.js';
import { LINKING_WORDS } from './passphrase.js';

export function strengthLabel(bits) {
  if (bits < 40) return ['Weak', 'weak'];
  if (bits < 60) return ['Fair', 'fair'];
  if (bits < 80) return ['Good', 'good'];
  if (bits < 128) return ['Strong', 'strong'];
  return ['Excellent', 'excellent'];
}

const LINKING = new Set(LINKING_WORDS);
const WORD_BITS = Math.log2(WORDS.length);

/**
 * Conservative entropy estimate for a human-chosen passphrase. It assumes an attacker who knows
 * our word lists and common habits:
 *   - a listed word (or its plural): log2(list size); a linking word: log2(42)
 *   - any other run of letters: 2 bits per letter (typical for English-like text)
 *   - digits: log2(10) each; the first symbol log2(32), symbols repeating the previous one: 0
 *   - capitals: nothing (people capitalise predictably)
 * Never more than length × log2(95), the bound for printable ASCII.
 */
export function estimateBits(text) {
  let bits = 0;
  let lastSymbol = null;
  for (const [run] of String(text).matchAll(/[A-Za-z]+|[0-9]+|[^A-Za-z0-9]/g)) {
    if (/^[A-Za-z]/.test(run)) {
      const w = run.toLowerCase();
      if (WORD_SET.has(w) || WORD_SET.has(w.replace(/e?s$/, ''))) bits += WORD_BITS;
      else if (LINKING.has(w)) bits += Math.log2(LINKING_WORDS.length);
      else bits += 2 * w.length;
    } else if (/^[0-9]/.test(run)) {
      bits += run.length * Math.log2(10);
    } else {
      bits += run === lastSymbol ? 0 : Math.log2(32);
      lastSymbol = run;
    }
  }
  return Math.min(bits, String(text).length * Math.log2(95));
}
