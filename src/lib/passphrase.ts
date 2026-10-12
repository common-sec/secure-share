// Memorable passphrases that are not just dictionary words.
//
// Default ("memorable") phrase, e.g.  Stone~Behind~Karrotish~Pencils42~Over~Quail
//   - content words: common words; half of them keep their plain form, the others get an ending
//     the way people bend words when speaking a foreign language: plurals, adjectives, adverbs,
//     nouns ("-s -y -ish -ful -less -ly -ness -ism -ist -ize -ed -ing -ery -ation -ment")
//   - at least one content word also gets a sound-alike spelling (carrot -> karrot,
//     squirrel -> skwirrel) or a doubled letter (lemon -> lemmon), so the phrase is never
//     made only of dictionary words
//   - one linking word (behind, over, within...) per pair of content words, in randomly chosen
//     gaps, so it reads like a little sentence without a fixed shape
//   - capitals only at syllable starts, one random separator used throughout, a number on a
//     random word
//
// Entropy: every random choice comes from crypto.getRandomValues. Each word slot's entropy is
// the exact Shannon entropy of its output distribution (computed once at load), so different
// choices that spell the same word aren't double counted.
import { randomInt, pick, shuffle } from './random.js';
import { WORDS, WORD_SET } from './words.js';

export const STYLES = {
  memorable: 'Memorable (bent real words)',
  invented: 'Invented words',
} as const;
export const SEPARATOR_OPTIONS = {
  same: 'One random symbol',
  rand: 'Random symbol each time',
  '-': 'Dash  -',
  '.': 'Dot  .',
  _: 'Underscore  _',
  space: 'Space',
  none: 'None',
} as const;
export const CAPS = {
  first: 'Each word',
  syllable: 'Random syllables',
  none: 'None',
} as const;

export type Style = keyof typeof STYLES;
export type Separator = keyof typeof SEPARATOR_OPTIONS;
export type Caps = keyof typeof CAPS;

export interface PhraseOptions {
  /** number of content words */
  w: number;
  style: Style;
  /** linking words between pairs of content words */
  link: boolean;
  sep: Separator;
  cap: Caps;
  /** a two-digit number on a random word */
  num: boolean;
}

export const PHRASE_DEFAULTS: PhraseOptions = { w: 4, style: 'memorable', link: true, sep: 'same', cap: 'first', num: true };

const FIXED_SEPARATORS: Record<string, string> = { '-': '-', '.': '.', _: '_', space: ' ', none: '' };
const RANDOM_SEPARATORS = '-._~+=!*';

export const LINKING_WORDS = ['in', 'on', 'at', 'by', 'of', 'to', 'for', 'with', 'from', 'into', 'over', 'under',
  'behind', 'beside', 'beyond', 'within', 'without', 'inside', 'near', 'past', 'through', 'across', 'around',
  'against', 'below', 'above', 'after', 'before', 'like', 'and', 'or', 'is', 'are', 'was', 'were', 'has', 'had',
  'the', 'my', 'our', 'your', 'their'];

const isVowel = (w: string, i: number): boolean => 'aeiou'.includes(w[i]) || (w[i] === 'y' && i > 0);
const log2 = Math.log2;

function shannon(masses: Map<string, number>): number {
  let bits = 0;
  for (const p of masses.values()) if (p > 0) bits -= p * log2(p);
  return bits;
}

// ---- endings ----
const ENDINGS = ['', 's', 'y', 'ish', 'ful', 'less', 'ly', 'ness', 'ism', 'ist', 'ize', 'ed', 'ing', 'ery', 'ation', 'ment'];
const BENT_ENDINGS = ENDINGS.slice(1);

/** Half the time a word keeps its plain form; otherwise it gets one of the endings. */
const pickEnding = (): string => (randomInt(2) ? '' : pick(BENT_ENDINGS));

/** Adds the probability mass of every (word, ending) outcome of pickEnding to `masses`. */
function addEndingMasses(masses: Map<string, number>, word: string, weight: number): void {
  const add = (out: string, p: number) => masses.set(out, (masses.get(out) ?? 0) + p);
  add(inflect(word, ''), weight / 2);
  for (const e of BENT_ENDINGS) add(inflect(word, e), weight / 2 / BENT_ENDINGS.length);
}

/** Appends an ending with simple English spelling rules (box -> boxes, stone -> stony, berry -> berries). */
export function inflect(word: string, ending: string): string {
  return ending ? join(word, ending).replace(/(.)\1\1/g, '$1$1') : word; // never three same letters
}

function join(word: string, ending: string): string {
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
const SUBSTITUTIONS: [from: string, to: string][] = [['ph', 'f'], ['f', 'ph'], ['ck', 'k'], ['c', 'k'], ['s', 'z'], ['x', 'ks'], ['qu', 'kw'], ['i', 'y'], ['y', 'i']];
const DOUBLABLE = 'bdfgklmnprtz';

export function respellings(word: string): string[] {
  const out = new Set<string>();
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
export function syllableStarts(word: string): number[] {
  const groups: [start: number, end: number][] = [];
  for (let i = 0; i < word.length;) {
    if (isVowel(word, i)) {
      const start = i;
      while (i < word.length && isVowel(word, i)) i++;
      groups.push([start, i]);
    } else i++;
  }
  const last = groups[groups.length - 1]!;
  // A final silent "e" (stone) is not a syllable, except after l (candle).
  if (groups.length > 1 && last[0] === word.length - 1 && word[last[0]] === 'e' && word[last[0] - 1] !== 'l') groups.pop();
  const starts: number[] = [];
  for (let g = 1; g < groups.length; g++) {
    let s = groups[g][0] - 1; // the consonant before the vowel group starts the syllable
    if (/^(ch|sh|th|ph|wh)$/.test(word.slice(s - 1, s + 1))) s -= 1;
    if (s > groups[g - 1][1] - 1 && s > 1) starts.push(s); // index 1 would read like a typo (OVer)
  }
  return starts;
}

const upperAt = (w: string, i: number): string => w.slice(0, i) + w[i].toUpperCase() + w.slice(i + 1);

// ---- invented words ----
// Onsets are consonants only, vowels are vowels only and the optional coda appears only at the
// end, so every invented word parses back into exactly one choice sequence.
const ONSETS = ['b', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'z',
  'br', 'bl', 'dr', 'fr', 'gr', 'gl', 'kr', 'pl', 'pr', 'st', 'tr', 'sk', 'sl', 'sh', 'ch'];
const VOWELS = ['a', 'e', 'i', 'o', 'u', 'ai', 'ou', 'ee'];
const CODAS = ['', 'n', 'r', 's', 'l', 'm', 'k', 'x'];
const INVENTED_BITS = 1 + 2.5 * log2(ONSETS.length * VOWELS.length) + log2(CODAS.length);

function invented(): string {
  let out = '';
  for (let i = 2 + randomInt(2); i > 0; i--) out += pick(ONSETS) + pick(VOWELS);
  return out + pick(CODAS);
}

// ---- tables (built once) ----
interface Tables {
  /** words that have at least one sound-alike respelling, with those respellings */
  respellable: [word: string, variants: string[]][];
  plainBits: number;
  bentBits: number;
  wordSyllables: number;
  linkSyllables: number;
}

let tables: Tables | null = null;
function getTables(): Tables {
  if (tables) return tables;
  const respellable = WORDS
    .map((w): [string, string[]] => [w, respellings(w)])
    .filter(([, r]) => r.length > 0);

  const plain = new Map<string, number>();
  for (const w of WORDS) addEndingMasses(plain, w, 1 / WORDS.length);
  const bent = new Map<string, number>();
  for (const [, variants] of respellable) {
    for (const v of variants) addEndingMasses(bent, v, 1 / (respellable.length * variants.length));
  }

  // Average bits per token from the "random syllables" capitals (one of k starts, or none).
  let extra = 0;
  const samples = 4000;
  const capBits = (w: string) => log2(syllableStarts(w).length + 1);
  for (let i = 0; i < samples; i++) extra += capBits(inflect(pick(WORDS), pickEnding()));
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
function contentWords(o: PhraseOptions): string[] {
  if (o.style === 'invented') return Array.from({ length: o.w }, invented);
  const t = getTables();
  let bend: boolean[];
  do { bend = Array.from({ length: o.w }, () => randomInt(2) === 1); } while (!bend.includes(true));
  return bend.map((b) => {
    const base = b ? pick(pick(t.respellable)[1]) : pick(WORDS);
    return inflect(base, pickEnding());
  });
}

/** One linking word per pair of content words, placed in randomly chosen gaps between them. */
const linkCount = (o: PhraseOptions): number => (o.link ? Math.floor(o.w / 2) : 0);

function binomial(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

export function generatePhrase(o: PhraseOptions): string {
  const content = contentWords(o);
  if (o.num) {
    const i = randomInt(content.length);
    content[i] += String(randomInt(100)).padStart(2, '0');
  }
  // Gap i is the space after content word i; pick linkCount distinct gaps at random.
  const gaps = shuffle(Array.from({ length: content.length - 1 }, (_, i) => i));
  const linked = new Set(gaps.slice(0, linkCount(o)));
  const tokens: string[] = [];
  content.forEach((word, i) => {
    tokens.push(word);
    if (linked.has(i)) tokens.push(pick(LINKING_WORDS));
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

export function phraseEntropy(o: PhraseOptions): number {
  const w = o.w;
  const links = linkCount(o);
  const gaps = w + links - 1;
  let bits: number;
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
  bits += links * log2(LINKING_WORDS.length) + log2(binomial(w - 1, links));
  if (o.sep === 'same') bits += log2(RANDOM_SEPARATORS.length);
  if (o.sep === 'rand') bits += gaps * log2(RANDOM_SEPARATORS.length);
  if (o.cap === 'syllable') {
    const t = getTables();
    bits += o.style === 'invented' ? w : w * t.wordSyllables + links * t.linkSyllables;
  }
  if (o.num) bits += log2(100) + log2(w);
  return bits;
}

/** Settings for chat and share room passphrases: short enough to read aloud, no fixed pattern. */
export const ROOM_PHRASE: PhraseOptions = { w: 3, style: 'memorable', link: true, sep: 'same', cap: 'first', num: true };

export function roomPassphrase(): string {
  return generatePhrase(ROOM_PHRASE);
}
