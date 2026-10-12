import { test, assert } from './harness.js';
import {
  generatePhrase, phraseEntropy, PHRASE_DEFAULTS, LINKING_WORDS, inflect, respellings, syllableStarts,
  roomPassphrase, ROOM_PHRASE,
} from '../../build/modules/lib/passphrase.js';
import { WORD_SET } from '../../build/modules/lib/words.js';
import { estimateBits } from '../../build/modules/lib/strength.js';

const isLinking = (t) => LINKING_WORDS.includes(t.toLowerCase());
const separatorOf = (phrase) => [...new Set(phrase.match(/[^A-Za-z0-9]/g))];

const words = (phrase) => phrase.split(/[^A-Za-z0-9]+/).map((w) => w.replace(/\d+$/, '').toLowerCase());

test('default phrases are never made only of dictionary words', () => {
  for (let i = 0; i < 300; i++) {
    const phrase = generatePhrase(PHRASE_DEFAULTS);
    const content = words(phrase).filter((w) => !LINKING_WORDS.includes(w));
    // At least one content word must be outside the word list in every inflected form.
    const bent = content.some((w) => !WORD_SET.has(w) && !WORD_SET.has(w.replace(/(s|es|ies)$/, '')));
    assert.ok(bent, phrase);
  }
});

test('default phrase structure: 4 words, 2 linking words, one separator, capitals, a number', () => {
  for (let i = 0; i < 100; i++) {
    const phrase = generatePhrase(PHRASE_DEFAULTS);
    const seps = separatorOf(phrase);
    assert.equal(seps.length, 1, `one separator: ${phrase}`);
    const tokens = phrase.split(seps[0]);
    assert.equal(tokens.length, 6, phrase);
    const links = tokens.map((t, j) => (isLinking(t) ? j : -1)).filter((j) => j >= 0);
    assert.equal(links.length, 2, `two linking words: ${phrase}`);
    assert.ok(!links.includes(0) && !links.includes(5), `linking words sit between content words: ${phrase}`);
    assert.ok(links[1] - links[0] > 1, `never two linking words in a row: ${phrase}`);
    assert.ok(tokens.every((t) => /^[A-Z]/.test(t)), `capitalised: ${phrase}`);
    assert.equal((phrase.match(/\d+/g) ?? []).length, 1, `one number: ${phrase}`);
  }
});

test('no fixed pattern: linking positions, separators and plain words all vary', () => {
  const positions = new Set();
  const separators = new Set();
  let plainWords = 0;
  for (let i = 0; i < 300; i++) {
    const phrase = generatePhrase(PHRASE_DEFAULTS);
    const sep = separatorOf(phrase)[0];
    separators.add(sep);
    const tokens = phrase.split(sep);
    positions.add(tokens.map((t) => (isLinking(t) ? 'L' : 'w')).join(''));
    plainWords += tokens.filter((t) => !isLinking(t) && WORD_SET.has(t.replace(/\d+$/, '').toLowerCase())).length;
  }
  assert.equal(positions.size, 3, `all three linking layouts appear: ${[...positions]}`);
  assert.atLeast(separators.size, 6, 'separators vary');
  assert.atLeast(plainWords, 100, 'many content words stay plain, not every word is bent');
});

test('default strength is at least 75 bits', () => {
  assert.atLeast(phraseEntropy(PHRASE_DEFAULTS), 75);
});

test('entropy grows with every option', () => {
  const base = { ...PHRASE_DEFAULTS, link: false, sep: '-', cap: 'none', num: false };
  const b = phraseEntropy(base);
  assert.ok(phraseEntropy({ ...base, w: base.w + 1 }) > b, 'more words');
  assert.ok(phraseEntropy({ ...base, link: true }) > b, 'linking words');
  assert.ok(phraseEntropy({ ...base, sep: 'same' }) > b, 'random separator');
  assert.ok(phraseEntropy({ ...base, cap: 'syllable' }) > b, 'syllable capitals');
  assert.ok(phraseEntropy({ ...base, num: true }) > b, 'number');
  assert.equal(phraseEntropy({ ...base, cap: 'first' }), b, 'predictable capitals add nothing');
});

test('syllable capitals only ever touch syllable starts, at most one extra per word', () => {
  for (let i = 0; i < 200; i++) {
    const phrase = generatePhrase({ ...PHRASE_DEFAULTS, cap: 'syllable', sep: '-', num: false });
    for (const token of phrase.split('-')) {
      const lower = token.toLowerCase();
      const caps = [...token].map((c, j) => (c !== lower[j] ? j : -1)).filter((j) => j > 0);
      assert.ok(caps.length <= 1, token);
      if (caps.length) assert.ok(syllableStarts(lower).includes(caps[0]), `${token}: ${caps[0]}`);
    }
  }
});

test('inflection follows simple spelling rules', () => {
  const cases = {
    'box+s': 'boxes', 'berry+s': 'berries', 'stone+y': 'stony', 'berry+ed': 'berried', 'fly+ing': 'flying',
    'happy+ness': 'happiness', 'windmill+less': 'windmilless', 'ravioli+ing': 'ravioling', 'pasta+y': 'pasta',
    'cat+': 'cat',
  };
  for (const [k, expected] of Object.entries(cases)) {
    const [w, e] = k.split('+');
    assert.equal(inflect(w, e), expected, k);
  }
});

test('respellings never produce a listed word and never equal the original', () => {
  for (const w of ['carrot', 'squirrel', 'lemon', 'cactus', 'phone', 'quilt', 'taxi', 'yacht']) {
    for (const r of respellings(w)) {
      assert.notEqual(r, w);
      assert.ok(!WORD_SET.has(r), r);
      assert.ok(!/^i/.test(r) || /^i/.test(w), `no leading y->i: ${r}`);
    }
  }
  assert.ok(respellings('carrot').includes('karrot'));
  assert.ok(respellings('lemon').includes('lemmon'));
});

test('syllable splitting', () => {
  assert.deepEqual(syllableStarts('garden'), [3]);
  assert.deepEqual(syllableStarts('pencil'), [3]);
  assert.deepEqual(syllableStarts('stone'), [], 'silent e');
  assert.deepEqual(syllableStarts('candle'), [4]);
  assert.deepEqual(syllableStarts('over'), [], 'never the second letter');
});

test('invented style', () => {
  const inv = generatePhrase({ ...PHRASE_DEFAULTS, style: 'invented', link: false, sep: '-', cap: 'none', num: false });
  assert.match(inv, /^[a-z]+(-[a-z]+){3}$/);
});

test('room passphrases: capitals, a number, one random separator, at least 50 bits', () => {
  const separators = new Set();
  for (let i = 0; i < 100; i++) {
    const phrase = roomPassphrase();
    const seps = separatorOf(phrase);
    assert.equal(seps.length, 1, phrase);
    separators.add(seps[0]);
    const tokens = phrase.split(seps[0]);
    assert.equal(tokens.length, 4, `3 words + 1 linking word: ${phrase}`);
    assert.ok(tokens.every((t) => /^[A-Z]/.test(t)), `capitalised: ${phrase}`);
    assert.equal((phrase.match(/\d+/g) ?? []).length, 1, `one number: ${phrase}`);
  }
  assert.atLeast(separators.size, 4, 'separator is not always the same');
  assert.atLeast(phraseEntropy(ROOM_PHRASE), 50);
});

test('strength estimate for typed passphrases is conservative', () => {
  assert.ok(estimateBits('garden') < 12, 'one listed word is about 10 bits');
  assert.ok(estimateBits('Garden') <= estimateBits('garden') + 0.001, 'capitals add nothing');
  assert.ok(estimateBits('garden-garden-garden') < 35, 'repeated separators add nothing');
  assert.ok(estimateBits('1234') < 14, 'four digits is about 13 bits');
  assert.equal(estimateBits(''), 0);
  for (let i = 0; i < 50; i++) {
    const phrase = roomPassphrase();
    assert.ok(estimateBits(phrase) <= phrase.length * Math.log2(95), 'never above the printable-ASCII bound');
  }
});
