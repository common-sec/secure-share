import { test, assert } from './harness.js';
import {
  generatePhrase, phraseEntropy, PHRASE_DEFAULTS, LINKING_WORDS, inflect, respellings, syllableStarts, roomPassphrase,
} from '../../src/lib/passphrase.js';
import { WORD_SET } from '../../src/lib/words.js';

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
    const seps = new Set(phrase.match(/[^A-Za-z0-9]/g));
    assert.equal(seps.size, 1, `one separator: ${phrase}`);
    const tokens = phrase.split([...seps][0]);
    assert.equal(tokens.length, 6, phrase);
    assert.ok(LINKING_WORDS.includes(tokens[1].toLowerCase()) && LINKING_WORDS.includes(tokens[4].toLowerCase()), phrase);
    assert.ok(tokens.every((t) => /^[A-Z]/.test(t)), `capitalised: ${phrase}`);
    assert.equal((phrase.match(/\d+/g) ?? []).length, 1, `one number: ${phrase}`);
  }
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

test('invented style and room passphrases', () => {
  const inv = generatePhrase({ ...PHRASE_DEFAULTS, style: 'invented', link: false, sep: '-', cap: 'none', num: false });
  assert.match(inv, /^[a-z]+(-[a-z]+){3}$/);
  for (let i = 0; i < 50; i++) assert.match(roomPassphrase(), /^[a-z]+(-[a-z]+){3}$/);
});
