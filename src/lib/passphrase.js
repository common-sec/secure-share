// Memorable passphrases that are not just dictionary words.
//
// Default ("memorable") phrase, e.g.  Karrotish~Behind~Stoneness~Pencils~Over~Quailing42
//   - content words: common words, each with a random ending, the way people bend words when
//     speaking a foreign language: plurals, adjectives, adverbs, nouns ("-s -y -ish -ful -less
//     -ly -ness -ism -ist -ize -ed -ing -ery -ation -ment", or none)
//   - at least one content word also gets a sound-alike spelling (carrot -> karrot,
//     squirrel -> skwirrel) or a doubled letter (lemon -> lemmon), so the phrase is never
//     made only of dictionary words
//   - linking words between pairs of content words (behind, over, within...) so it reads
//     like a little sentence
//   - capitals only at syllable starts, one random separator used throughout, a number
//
// Entropy: every random choice comes from crypto.getRandomValues. Each word slot's entropy is
// the exact Shannon entropy of its output distribution (computed once at load), so different
// choices that spell the same word aren't double counted.
import { randomInt, pick } from './random.js';
import { WORDS, WORD_SET } from './words.js';

export const STYLES = {
  memorable: 'Memorable (bent real words)',
  invented: 'Invented words',
};
export const SEPARATOR_OPTIONS = {
  same: 'One random symbol',
  rand: 'Random symbol each time',
  '-': 'Dash  -',
  '.': 'Dot  .',
  _: 'Underscore  _',
  space: 'Space',
  none: 'None',
};
export const CAPS = {
  first: 'Each word',
  syllable: 'Random syllables',
  none: 'None',
};
export const PHRASE_DEFAULTS = { w: 4, style: 'memorable', link: true, sep: 'same', cap: 'first', num: true };

const FIXED_SEPARATORS = { '-': '-', '.': '.', _: '_', space: ' ', none: '' };
const RANDOM_SEPARATORS = '-._~+=!*';

export const LINKING_WORDS = ['in', 'on', 'at', 'by', 'of', 'to', 'for', 'with', 'from', 'into', 'over', 'under',
  'behind', 'beside', 'beyond', 'within', 'without', 'inside', 'near', 'past', 'through', 'across', 'around',
  'against', 'below', 'above', 'after', 'before', 'like', 'and', 'or', 'is', 'are', 'was', 'were', 'has', 'had',
  'the', 'my', 'our', 'your', 'their'];

const isVowel = (w, i) => 'aeiou'.includes(w[i]) || (w[i] === 'y' && i > 0);
const log2 = Math.log2;

function shannon(masses) {
  let bits = 0;
  for (const p of masses.values()) if (p > 0) bits -= p * log2(p);
  return bits;
}

// ---- endings ----
const ENDINGS = ['', 's', 'y', 'ish', 'ful', 'less', 'ly', 'ness', 'ism', 'ist', 'ize', 'ed', 'ing', 'ery', 'ation', 'ment'];

/** Appends an ending with simple English spelling rules (box -> boxes, stone -> stony, berry -> berries). */
export function inflect(word, ending) {
  return ending ? join(word, ending).replace(/(.)\1\1/g, '$1$1') : word; // never three same letters
}

function join(word, ending) {
  const last = word[word.length - 1];
  const consonantY = last === 'y' && !isVowel(word, word.length - 2);
  if (ending === 's') {
    if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`;
    return consonantY ? `${word.slice(0, -1)}ies` : `${word}s`;
  }
  if ('aeiouy'.includes(ending[0])) {
    if (last === 'e') return word.slice(0, -1) + ending; // stone + y -> stony
    if (ending === 'y' && 'aiouy'.includes(last)) return word; // no "berryy" / "pastay"
    if (last === ending[0]) return word + ending.slice(1); // ravioli + ing -> ravioling
    // berry + ed -> berried, but fly + ing / ish / ism / ist / ize keeps its y
    if (consonantY && ending[0] !== 'i') return `${word.slice(0, -1)}i${ending}`;
    return word + ending;
  }
  return consonantY ? `${word.slice(0, -1)}i${ending}` : word + ending; // berry + ness -> berriness
}

// ---- sound-alike spellings ----
const SUBSTITUTIONS = [['ph', 'f'], ['f', 'ph'], ['ck', 'k'], ['c', 'k'], ['s', 'z'], ['x', 'ks'], ['qu', 'kw'], ['i', 'y'], ['y', 'i']];
const DOUBLABLE = 'bdfgklmnprtz';

export function respellings(word) {
  const out = new Set();
  for (const [from, to] of SUBSTITUTIONS) {
    for (let i = word.indexOf(from); i !== -1; i = word.indexOf(from, i + 1)) {
      const next = word[i + from.length];
      if (from === 'c' && (next === 'k' || next === 'h')) continue; // ck / ch keep their sound
      if (from === 's' && next === 'h') continue; // sh
      if (from === 'f' && (next === 'f' || word[i - 1] === 'f')) continue;
      if (from === 'y' && i === 0) continue; // yacht -> iacht is unreadable
      out.add(word.slice(0, i) + to + word.slice(i + from.length));
    }
  }
  // A doubled consonant between two vowels (lemon -> lemmon), never inside a cluster.
  for (let i = 1; i < word.length - 1; i++) {
    const c = word[i];
    if (DOUBLABLE.includes(c) && isVowel(word, i - 1) && isVowel(word, i + 1)) out.add(word.slice(0, i) + c + word.slice(i));
  }
  out.delete(word);
  for (const m of out) if (WORD_SET.has(m)) out.delete(m);
  return [...out];
}

// ---- syllables (for capitals) ----
/** Indexes where a new syllable starts after the first (garden -> [3]: gar|den). */
export function syllableStarts(word) {
  const groups = [];
  for (let i = 0; i < word.length;) {
    if (isVowel(word, i)) {
      const start = i;
      while (i < word.length && isVowel(word, i)) i++;
      groups.push([start, i]);
    } else i++;
  }
  const last = groups[groups.length - 1];
  // A final silent "e" (stone) is not a syllable, except after l (candle).
  if (groups.length > 1 && last[0] === word.length - 1 && word[last[0]] === 'e' && word[last[0] - 1] !== 'l') groups.pop();
  const starts = [];
  for (let g = 1; g < groups.length; g++) {
    let s = groups[g][0] - 1; // the consonant before the vowel group starts the syllable
    if (/^(ch|sh|th|ph|wh)$/.test(word.slice(s - 1, s + 1))) s -= 1;
    if (s > groups[g - 1][1] - 1 && s > 1) starts.push(s); // index 1 would read like a typo (OVer)
  }
  return starts;
}

const upperAt = (w, i) => w.slice(0, i) + w[i].toUpperCase() + w.slice(i + 1);

// ---- invented words ----
// Onsets are consonants only, vowels are vowels only and the optional coda appears only at the
// end, so every invented word parses back into exactly one choice sequence.
const ONSETS = ['b', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'z',
  'br', 'bl', 'dr', 'fr', 'gr', 'gl', 'kr', 'pl', 'pr', 'st', 'tr', 'sk', 'sl', 'sh', 'ch'];
const VOWELS = ['a', 'e', 'i', 'o', 'u', 'ai', 'ou', 'ee'];
const CODAS = ['', 'n', 'r', 's', 'l', 'm', 'k', 'x'];
const INVENTED_BITS = 1 + 2.5 * log2(ONSETS.length * VOWELS.length) + log2(CODAS.length);

function invented() {
  let out = '';
  for (let i = 2 + randomInt(2); i > 0; i--) out += pick(ONSETS) + pick(VOWELS);
  return out + pick(CODAS);
}

// ---- tables (built once) ----
let tables = null;
function getTables() {
  if (tables) return tables;
  const respellable = WORDS.map((w) => [w, respellings(w)]).filter(([, r]) => r.length > 0);

  const plain = new Map();
  for (const w of WORDS) for (const e of ENDINGS) {
    const out = inflect(w, e);
    plain.set(out, (plain.get(out) ?? 0) + 1 / (WORDS.length * ENDINGS.length));
  }
  const bent = new Map();
  for (const [, variants] of respellable) for (const v of variants) for (const e of ENDINGS) {
    const out = inflect(v, e);
    bent.set(out, (bent.get(out) ?? 0) + 1 / (respellable.length * variants.length * ENDINGS.length));
  }

  // Average bits per token from the "random syllables" capitals (one of k starts, or none).
  let extra = 0;
  const samples = 4000;
  const capBits = (w) => log2(syllableStarts(w).length + 1);
  for (let i = 0; i < samples; i++) extra += capBits(inflect(pick(WORDS), pick(ENDINGS)));
  const linkExtra = LINKING_WORDS.reduce((n, w) => n + capBits(w), 0) / LINKING_WORDS.length;

  tables = {
    respellable,
    plainBits: shannon(plain),
    bentBits: shannon(bent),
    wordSyllables: extra / samples,
    linkSyllables: linkExtra,
  };
  return tables;
}

// ---- generation ----
function contentWords(o) {
  if (o.style === 'invented') return Array.from({ length: o.w }, invented);
  const t = getTables();
  let bend;
  do { bend = Array.from({ length: o.w }, () => randomInt(2) === 1); } while (!bend.includes(true));
  return bend.map((b) => {
    const base = b ? pick(pick(t.respellable)[1]) : pick(WORDS);
    return inflect(base, pick(ENDINGS));
  });
}

/** Linking words go between each pair of content words: A link B, C link D, ... */
const linkCount = (o) => (o.link ? Math.floor(o.w / 2) : 0);

export function generatePhrase(o) {
  const content = contentWords(o);
  if (o.num) {
    const i = randomInt(content.length);
    content[i] += String(randomInt(100)).padStart(2, '0');
  }
  const tokens = [];
  content.forEach((word, i) => {
    tokens.push(word);
    if (o.link && i % 2 === 0 && i + 1 < content.length) tokens.push(pick(LINKING_WORDS));
  });

  const capped = tokens.map((t) => {
    if (o.cap === 'none') return t;
    let out = upperAt(t, 0);
    if (o.cap === 'syllable') {
      // At most one extra capital per word, at a syllable start (PenGuin), or none.
      const starts = syllableStarts(t);
      const choice = randomInt(starts.length + 1);
      if (choice < starts.length) out = upperAt(out, starts[choice]);
    }
    return out;
  });

  const sameSep = pick(RANDOM_SEPARATORS);
  let out = capped[0];
  for (let i = 1; i < capped.length; i++) {
    const sep = o.sep === 'same' ? sameSep : o.sep === 'rand' ? pick(RANDOM_SEPARATORS) : FIXED_SEPARATORS[o.sep] ?? '-';
    out += sep + capped[i];
  }
  return out;
}

export function phraseEntropy(o) {
  const w = o.w;
  const links = linkCount(o);
  const gaps = w + links - 1;
  let bits;
  if (o.style === 'invented') {
    bits = w * INVENTED_BITS;
  } else {
    const t = getTables();
    // Which words are bent is a uniform choice among the 2^w - 1 non-empty masks.
    const masks = 2 ** w - 1;
    const expectedBent = (w * 2 ** (w - 1)) / masks;
    // -1 bit: a bent word can occasionally spell the same as an unbent one.
    bits = log2(masks) + expectedBent * t.bentBits + (w - expectedBent) * t.plainBits - 1;
  }
  bits += links * log2(LINKING_WORDS.length);
  if (o.sep === 'same') bits += log2(RANDOM_SEPARATORS.length);
  if (o.sep === 'rand') bits += gaps * log2(RANDOM_SEPARATORS.length);
  if (o.cap === 'syllable') {
    const t = getTables();
    bits += o.style === 'invented' ? w : w * t.wordSyllables + links * t.linkSyllables;
  }
  if (o.num) bits += log2(100) + log2(w);
  return bits;
}

/** Passphrase for chat and share rooms: easy to read aloud and type. */
export function roomPassphrase() {
  return generatePhrase({ w: 3, style: 'memorable', link: true, sep: '-', cap: 'none', num: false });
}
