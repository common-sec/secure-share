import { h, copyText } from '../lib/dom.js';
import { pick, shuffle } from '../lib/random.js';
import {
  generatePhrase, phraseEntropy, PHRASE_DEFAULTS, STYLES, SEPARATOR_OPTIONS, CAPS,
  type Caps, type PhraseOptions, type Separator, type Style,
} from '../lib/passphrase.js';
import { strengthMeter } from './widgets.js';

const SETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
};
const DEFAULT_SYMBOLS = '!@#$%^&*()-_=+[]{};:,.<>/?~';
const AMBIGUOUS = 'Il1|O0o';

export interface Settings {
  mode: 'chars' | 'phrase';
  // random characters
  len: number; lower: boolean; upper: boolean; digits: boolean; symbols: boolean;
  sym: string; amb: boolean; req: boolean; ex: string;
  // how many to generate
  n: number;
  // passphrase
  w: number; style: Style; link: boolean; sep: Separator; cap: Caps; num: boolean;
}
type NumKey = 'len' | 'n' | 'w';
type BoolKey = 'lower' | 'upper' | 'digits' | 'symbols' | 'amb' | 'req' | 'link' | 'num';
type ChoiceKey = 'mode' | 'style' | 'sep' | 'cap';

// Settings <-> URL params. Only settings ever go in the link, never a password.
export const DEFAULTS: Settings = {
  mode: 'phrase',
  len: 20, lower: true, upper: true, digits: true, symbols: true,
  sym: DEFAULT_SYMBOLS, amb: false, req: true, ex: '', n: 1,
  w: PHRASE_DEFAULTS.w, style: PHRASE_DEFAULTS.style, link: PHRASE_DEFAULTS.link,
  sep: PHRASE_DEFAULTS.sep, cap: PHRASE_DEFAULTS.cap, num: PHRASE_DEFAULTS.num,
};
const LIMITS: Record<NumKey, [min: number, max: number]> = { len: [4, 256], n: [1, 50], w: [2, 12] };
const CHOICES: Record<ChoiceKey, readonly string[]> = {
  mode: ['chars', 'phrase'],
  style: Object.keys(STYLES),
  sep: Object.keys(SEPARATOR_OPTIONS),
  cap: Object.keys(CAPS),
};

/** Reads settings from URL parameters; anything invalid falls back to the default. */
function readSettings(params: URLSearchParams): Settings {
  const s: Settings = { ...DEFAULTS };
  const out = s as unknown as Record<string, unknown>;
  for (const [k, def] of Object.entries(DEFAULTS)) {
    const v = params.get(k);
    if (v === null) continue;
    if (typeof def === 'boolean') out[k] = v === '1';
    else if (typeof def === 'number') {
      const n = parseInt(v, 10);
      const [min, max] = LIMITS[k as NumKey];
      if (Number.isFinite(n)) out[k] = Math.min(max, Math.max(min, n));
    } else if (k in CHOICES) {
      if (CHOICES[k as ChoiceKey].includes(v)) out[k] = v;
    } else out[k] = v.slice(0, 64);
  }
  return s;
}

function writeParams(s: Settings): string {
  const defaults = DEFAULTS as unknown as Record<string, unknown>;
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(s)) {
    if (v === defaults[k]) continue;
    p.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
  }
  return p.toString();
}

// ---- character passwords ----
type CharSettings = Pick<Settings, 'len' | 'lower' | 'upper' | 'digits' | 'symbols' | 'sym' | 'amb' | 'req' | 'ex'>;

function buildSets(s: CharSettings): string[] {
  const remove = new Set([...s.ex, ...(s.amb ? AMBIGUOUS : '')]);
  const clean = (chars: string) => [...new Set(chars)].filter((c) => !remove.has(c)).join('');
  const sets: string[] = [];
  if (s.lower) sets.push(clean(SETS.lower));
  if (s.upper) sets.push(clean(SETS.upper));
  if (s.digits) sets.push(clean(SETS.digits));
  if (s.symbols) sets.push(clean(s.sym));
  return sets.filter((x) => x.length > 0);
}

export function generateChars(s: CharSettings): { value: string; bits: number } {
  const sets = buildSets(s);
  const pool = [...new Set(sets.join(''))].join('');
  if (!pool) throw new Error('Select at least one character set.');
  const chars: string[] = [];
  if (s.req) {
    if (sets.length > s.len) throw new Error('Length is shorter than the number of required sets.');
    for (const set of sets) chars.push(pick(set));
  }
  while (chars.length < s.len) chars.push(pick(pool));
  return { value: shuffle(chars).join(''), bits: s.len * Math.log2(pool.length) };
}

const phraseOptions = (s: Settings): PhraseOptions => ({
  w: s.w, style: s.style, link: s.link, sep: s.sep, cap: s.cap, num: s.num,
});

function generateOne(s: Settings): { value: string; bits: number } {
  if (s.mode === 'chars') return generateChars(s);
  const o = phraseOptions(s);
  return { value: generatePhrase(o), bits: phraseEntropy(o) };
}

export function mount(root: HTMLElement, params: URLSearchParams): void {
  const s = readSettings(params);

  const output = h('ul', { class: 'pw-list' });
  const meter = strengthMeter();
  const error = h('p', { class: 'error', hidden: true });

  // ---- controls ----
  const number = (key: NumKey, min: number, max: number) => {
    const el = h('input', { type: 'number', min, max, value: String(s[key]), class: 'num' });
    el.addEventListener('change', () => {
      const [lo, hi] = LIMITS[key];
      s[key] = Math.min(hi, Math.max(lo, parseInt(el.value, 10) || DEFAULTS[key]));
      el.value = String(s[key]);
      update();
    });
    return el;
  };
  const check = (key: BoolKey, label: string, hint?: string) => h('label', { class: 'check' },
    h('input', {
      type: 'checkbox', checked: s[key],
      onchange: (e: Event) => { s[key] = (e.target as HTMLInputElement).checked; symInput.disabled = !s.symbols; update(); },
    }),
    h('span', null, label, hint ? h('small', null, hint) : null),
  );
  const select = (key: ChoiceKey, options: Array<[value: string, label: string]>) => {
    const el = h('select', null, ...options.map(([v, label]) => h('option', { value: v, selected: s[key] === v }, label)));
    el.addEventListener('change', () => {
      if (CHOICES[key].includes(el.value)) (s as unknown as Record<string, unknown>)[key] = el.value;
      update();
    });
    return el;
  };
  const field = (label: string, control: HTMLElement) => h('div', { class: 'field' }, h('label', null, label), control);

  const lenRange = h('input', { type: 'range', min: LIMITS.len[0], max: 64, value: String(Math.min(s.len, 64)), 'aria-label': 'Length' });
  const lenNum = number('len', LIMITS.len[0], LIMITS.len[1]);
  lenRange.addEventListener('input', () => { lenNum.value = lenRange.value; lenNum.dispatchEvent(new Event('change')); });
  lenNum.addEventListener('change', () => { lenRange.value = String(Math.min(s.len, 64)); });
  const symInput = h('input', { type: 'text', value: s.sym, spellcheck: 'false', class: 'mono', disabled: !s.symbols });
  symInput.addEventListener('input', () => { s.sym = symInput.value || DEFAULT_SYMBOLS; update(); });
  const exInput = h('input', { type: 'text', value: s.ex, spellcheck: 'false', class: 'mono', placeholder: 'e.g. {}[]' });
  exInput.addEventListener('input', () => { s.ex = exInput.value; update(); });

  const charsPanel = h('div', null,
    field('Length', h('div', { class: 'row grow tight' }, lenRange, lenNum)),
    h('div', { class: 'grid2' },
      check('lower', 'Lowercase', 'a–z'),
      check('upper', 'Uppercase', 'A–Z'),
      check('digits', 'Digits', '0–9'),
      check('symbols', 'Symbols'),
      check('amb', 'Exclude look-alikes', AMBIGUOUS),
      check('req', 'At least one of each set'),
    ),
    field('Symbol set', symInput),
    field('Never use these characters', exInput),
  );

  const phrasePanel = h('div', null,
    h('div', { class: 'grid2' },
      field('Words', number('w', LIMITS.w[0], LIMITS.w[1])),
      field('Word style', select('style', Object.entries(STYLES))),
      field('Separator', select('sep', Object.entries(SEPARATOR_OPTIONS))),
      field('Capitals', select('cap', Object.entries(CAPS))),
    ),
    h('div', { class: 'grid2' },
      check('link', 'Linking words', 'behind, over, within… between word pairs'),
      check('num', 'Add a number', 'two random digits on a random word')),
    h('p', { class: 'hint' },
      'Common words bent the way people do when speaking a foreign language (carrot → Carrotish, stone → Stoneness), at least one with a sound-alike spelling (Karrot, Skwirrel, Lemmon), linked like a short sentence. Easy to remember, never just dictionary words.'),
  );

  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const tab = (mode: Settings['mode'], label: string) => {
    const b = h('button', { role: 'tab', class: 'tab', onclick: () => { s.mode = mode; update(); } }, label);
    b.dataset.mode = mode;
    return b;
  };
  tabs.append(tab('phrase', 'Passphrase'), tab('chars', 'Random characters'));

  function regenerate() {
    output.replaceChildren();
    try {
      let bits = 0;
      for (let i = 0; i < s.n; i++) {
        const r = generateOne(s);
        bits = r.bits;
        const copyBtn = h('button', { class: 'btn btn-small', onclick: () => copyText(r.value, copyBtn) }, 'Copy');
        output.append(h('li', null, h('code', { class: 'pw' }, r.value), copyBtn));
      }
      meter.set(bits);
      error.hidden = true;
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : String(e);
      error.hidden = false;
      meter.set(null);
    }
  }

  function update() {
    for (const b of tabs.children) b.setAttribute('aria-selected', String((b as HTMLElement).dataset.mode === s.mode));
    charsPanel.hidden = s.mode !== 'chars';
    phrasePanel.hidden = s.mode !== 'phrase';
    const q = writeParams(s);
    history.replaceState(null, '', `#/password${q ? `?${q}` : ''}`);
    regenerate();
  }

  const linkBtn = h('button', { class: 'btn', onclick: () => copyText(location.href, linkBtn) }, 'Copy settings link');
  const resetBtn = h('button', { class: 'btn btn-ghost', onclick: () => { location.hash = '#/password?'; } }, 'Reset');

  root.append(
    h('section', { class: 'page-head' },
      h('h1', null, 'Password Generator'),
      h('p', { class: 'lead' }, 'Generated locally with ', h('code', null, 'crypto.getRandomValues'), '. Nothing leaves your browser.'),
    ),
    tabs,
    h('div', { class: 'card' },
      output,
      error,
      meter.el,
      h('div', { class: 'row' }, h('button', { class: 'btn btn-primary', onclick: regenerate }, '↻ Regenerate')),
    ),
    h('div', { class: 'card' },
      h('h2', null, 'Settings'),
      charsPanel,
      phrasePanel,
      field('How many', number('n', LIMITS.n[0], LIMITS.n[1])),
      h('div', { class: 'row' }, linkBtn, resetBtn),
      h('p', { class: 'hint' }, 'The link stores only these settings. Passwords are never put in the URL.'),
    ),
  );

  update();
}
