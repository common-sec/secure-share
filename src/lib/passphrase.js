// Memorable passphrases. Word kinds:
//  - real:     a common word as-is                         (garden)
//  - modified: a common word with one small, sayable change (cactus -> kaktus, lemon -> lemmon,
//              rocket -> rocketix). Never equal to a word in the list.
//  - blend:    the start of one word + the end of another   (garden + pickle -> garle)
//  - invented: pronounceable syllables                      (toumik)
// The default "mixed" style uses real and modified words, with at least one modified word.
// Entropy is computed from the generator's actual choices (exact Shannon entropy of each word
// slot's output distribution), never from the length of the result.
import { randomInt, pick } from './random.js';
import { WORDS, WORD_SET } from './words.js';

export const SEPARATORS = { '-': '-', '.': '.', '_': '_', space: ' ', none: '', rand: null };
const RANDOM_SEPARATORS = '-._~+=!*';

export const KINDS = {
  mixed: 'Real + modified words',
  modified: 'Modified words only',
  both: 'Blends + invented',
  blend: 'Blended words',
  invented: 'Invented words',
};

export const PHRASE_DEFAULTS = { w: 4, kinds: 'mixed', sep: '-', cap: 'first', num: true };

/** Shannon entropy (bits) of a distribution given as Map(outcome -> probability mass). */
function entropy(masses) {
  let bits = 0;
  for (const p of masses.values()) if (p > 0) bits -= p * Math.log2(p);
  return bits;
}

const REAL_BITS = Math.log2(WORDS.length);
const isVowel = (w, i) => 'aeiou'.includes(w[i]) || (w[i] === 'y' && i > 0);

// ---- modified words ----
// Sound-alike spellings: the word still reads the same, but it is no longer a dictionary word.
const SUBSTITUTIONS = [['ph', 'f'], ['f', 'ph'], ['ck', 'k'], ['c', 'k'], ['s', 'z'], ['x', 'ks'], ['qu', 'kw'], ['i', 'y'], ['y', 'i']];
const DOUBLABLE = 'bdfgklmnprtz';
// Playful endings; vowel-led ones only after a consonant so the word stays sayable.
const SUFFIXES_AFTER_CONSONANT = ['o', 'ix', 'ex', 'zy'];
const SUFFIXES_AFTER_VOWEL = ['x', 'zy', 'ko'];

function mutations(word) {
  const out = new Set();
  for (const [from, to] of SUBSTITUTIONS) {
    for (let i = word.indexOf(from); i !== -1; i = word.indexOf(from, i + 1)) {
      const next = word[i + from.length];
      if (from === 'c' && (next === 'k' || next === 'h')) continue; // ck / ch keep their sound
      if (from === 's' && next === 'h') continue; // sh
      if (from === 'y' && i === 0) continue; // yacht -> iacht is unreadable
      if (from === 'f' && (next === 'f' || word[i - 1] === 'f')) continue; // ff -> fph reads badly
      out.add(word.slice(0, i) + to + word.slice(i + from.length));
    }
  }
  for (let i = 1; i < word.length - 1; i++) {
    const c = word[i];
    // Only between two vowels (lemon -> lemmon), never inside a consonant cluster.
    if (DOUBLABLE.includes(c) && isVowel(word, i - 1) && isVowel(word, i + 1)) out.add(word.slice(0, i) + c + word.slice(i));
  }
  const endsInVowel = 'aeiouy'.includes(word[word.length - 1]);
  for (const s of endsInVowel ? SUFFIXES_AFTER_VOWEL : SUFFIXES_AFTER_CONSONANT) out.add(word + s);
  out.delete(word);
  for (const m of out) if (WORD_SET.has(m)) out.delete(m);
  return [...out];
}

let modTable = null;
function modified() {
  if (!modTable) {
    const entries = WORDS.map((w) => [w, mutations(w)]).filter(([, m]) => m.length > 0);
    const masses = new Map();
    for (const [, muts] of entries) {
      for (const m of muts) masses.set(m, (masses.get(m) ?? 0) + 1 / entries.length / muts.length);
    }
    modTable = { entries, bits: entropy(masses) };
  }
  return modTable;
}

function modifiedWord() {
  const [, muts] = pick(modified().entries);
  return pick(muts);
}

// ---- invented words ----
// Onsets are consonants only, vowels are vowels only and the optional coda appears only at the
// end, so every invented word parses back into exactly one choice sequence.
const ONSETS = ['b', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'z',
  'br', 'bl', 'dr', 'fr', 'gr', 'gl', 'kr', 'pl', 'pr', 'st', 'tr', 'sk', 'sl', 'sh', 'ch'];
const VOWELS = ['a', 'e', 'i', 'o', 'u', 'ai', 'ou', 'ee'];
const CODAS = ['', 'n', 'r', 's', 'l', 'm', 'k', 'x'];
const SYLLABLE_BITS = Math.log2(ONSETS.length * VOWELS.length);
const INVENTED_BITS = 1 + (2 * SYLLABLE_BITS + 3 * SYLLABLE_BITS) / 2 + Math.log2(CODAS.length);

function invented() {
  const syllables = 2 + randomInt(2);
  let out = '';
  for (let i = 0; i < syllables; i++) out += pick(ONSETS) + pick(VOWELS);
  return out + pick(CODAS);
}

// ---- blends ----

function vowelGroups(w) {
  const groups = [];
  for (let i = 0; i < w.length;) {
    if (isVowel(w, i)) {
      const start = i;
      while (i < w.length && isVowel(w, i)) i++;
      groups.push([start, i]);
    } else i++;
  }
  return groups;
}

function prefixOf(w) { // "garden" -> "gar"
  const g = vowelGroups(w);
  return g.length < 2 ? null : w.slice(0, g[0][1] + (g[1][0] - g[0][1]) - 1);
}

function suffixOf(w) { // "pickle" -> "le"
  const g = vowelGroups(w);
  return g.length < 2 ? null : w.slice(g[g.length - 1][0] - 1);
}

let blendTable = null;
function blends() {
  if (!blendTable) {
    const prefixes = [...new Set(WORDS.map(prefixOf).filter((p) => p && p.length >= 2))];
    const suffixes = [...new Set(WORDS.map(suffixOf).filter((s) => s && s.length >= 2))];
    const masses = new Map();
    const unit = 1 / (prefixes.length * suffixes.length);
    for (const p of prefixes) for (const s of suffixes) masses.set(p + s, (masses.get(p + s) ?? 0) + unit);
    blendTable = { prefixes, suffixes, bits: entropy(masses) };
  }
  return blendTable;
}

const blend = () => pick(blends().prefixes) + pick(blends().suffixes);

// ---- phrases ----
function words(o) {
  const w = o.w;
  switch (o.kinds) {
    case 'modified': return Array.from({ length: w }, modifiedWord);
    case 'blend': return Array.from({ length: w }, blend);
    case 'invented': return Array.from({ length: w }, invented);
    case 'both': return Array.from({ length: w }, () => (randomInt(2) ? blend() : invented()));
    default: {
      // mixed: each word is modified with probability 1/2, re-drawn until at least one is.
      let mask;
      do { mask = Array.from({ length: w }, () => randomInt(2) === 1); } while (!mask.includes(true));
      return mask.map((m) => (m ? modifiedWord() : pick(WORDS)));
    }
  }
}

export function phraseEntropy(o) {
  const w = o.w;
  let bits;
  switch (o.kinds) {
    case 'modified': bits = w * modified().bits; break;
    case 'blend': bits = w * blends().bits; break;
    case 'invented': bits = w * INVENTED_BITS; break;
    // Conservatively count only the weaker kind, with no credit for the coin flip.
    case 'both': bits = w * Math.min(blends().bits, INVENTED_BITS); break;
    default: {
      // Modified words are never real words, so which slots were modified is visible in the
      // output: count the mask (uniform over non-empty masks) plus each slot's own entropy.
      const masks = 2 ** w - 1;
      const expectedModified = (w * 2 ** (w - 1)) / masks;
      bits = Math.log2(masks) + (w - expectedModified) * REAL_BITS + expectedModified * modified().bits;
    }
  }
  if (o.sep === 'rand') bits += (w - 1) * Math.log2(RANDOM_SEPARATORS.length);
  if (o.cap === 'random') bits += w;
  if (o.num) bits += Math.log2(100) + Math.log2(w);
  return bits;
}

export function generatePhrase(o) {
  const list = words(o);
  for (let i = 0; i < list.length; i++) {
    const upper = o.cap === 'first' || (o.cap === 'random' && randomInt(2) === 1);
    if (upper) list[i] = list[i][0].toUpperCase() + list[i].slice(1);
  }
  if (o.num) {
    const i = randomInt(list.length);
    list[i] += String(randomInt(100)).padStart(2, '0');
  }
  let out = list[0];
  for (let i = 1; i < list.length; i++) {
    out += (o.sep === 'rand' ? pick(RANDOM_SEPARATORS) : SEPARATORS[o.sep] ?? '-') + list[i];
  }
  return out;
}

/** Passphrase for chat and share rooms: easy to read aloud and type. */
export function roomPassphrase() {
  return generatePhrase({ w: 3, kinds: 'mixed', sep: '-', cap: 'none', num: false });
}
