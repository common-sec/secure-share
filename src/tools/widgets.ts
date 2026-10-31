// UI pieces shared by the tools.
import { h, copyText, type Child } from '../lib/dom.js';
import { roomPassphrase } from '../lib/passphrase.js';
import { strengthLabel, estimateBits } from '../lib/strength.js';

export interface StrengthMeter {
  el: HTMLElement;
  set(bits: number | null, opts?: { estimated?: boolean }): void;
}

/** Strength meter: call set(bits, { estimated }) to update. */
export function strengthMeter(): StrengthMeter {
  const fill = h('div', { class: 'meter-fill' });
  const label = h('span', { class: 'meter-label' });
  const el = h('div', { class: 'meter' }, h('div', { class: 'meter-track' }, fill), label);
  return {
    el,
    set(bits, { estimated = false } = {}) {
      if (bits == null) {
        fill.style.width = '0%';
        label.textContent = '';
        return;
      }
      const [name, cls] = strengthLabel(bits);
      fill.className = `meter-fill ${cls}`;
      fill.style.width = `${Math.min(100, (bits / 128) * 100)}%`;
      label.textContent = estimated
        ? `${name} · ≈${Math.floor(bits)} bits (estimate for a typed passphrase)`
        : `${name} · ≈${Math.floor(bits)} bits of entropy`;
    },
  };
}

// Secrets are never in type=password fields, so browsers and password managers don't offer to
// save them (a room passphrase is used once; a saved copy only leaks it). They're masked with
// -webkit-text-security instead (Chrome, Edge, Safari); where that's missing, type=password is
// the fallback, with autocomplete off and the password managers' own "ignore" attributes.
const TEXT_SECURITY = typeof CSS !== 'undefined' && CSS.supports('-webkit-text-security', 'disc');
const NO_SAVE = {
  autocomplete: 'off', 'data-1p-ignore': 'true', 'data-lpignore': 'true', 'data-bwignore': 'true', 'data-form-type': 'other',
};

function setMasked(input: HTMLInputElement, masked: boolean): void {
  if (TEXT_SECURITY) input.classList.toggle('masked', masked);
  else input.type = masked ? 'password' : 'text';
}

const isMasked = (input: HTMLInputElement): boolean =>
  TEXT_SECURITY ? input.classList.contains('masked') : input.type === 'password';

/** A masked input for a secret, which the browser won't offer to save. */
export function secretInput(attrs: Record<string, unknown>): HTMLInputElement {
  const input = h('input', { type: 'text', ...NO_SAVE, ...attrs });
  setMasked(input, true);
  return input;
}

/** A Show/Hide button that toggles a secretInput between masked and visible. */
export function revealToggle(input: HTMLInputElement): HTMLButtonElement {
  const btn = h('button', { type: 'button', class: 'btn btn-ghost', 'aria-pressed': 'false' }, 'Show');
  btn.addEventListener('click', () => {
    const show = isMasked(input);
    setMasked(input, !show);
    btn.textContent = show ? 'Hide' : 'Show';
    btn.setAttribute('aria-pressed', String(show));
  });
  return btn;
}

const ROOM_CONTEXT = 'A generated passphrase is plenty for a room: it can only be guessed live, against your browser, and the room locks after 5 wrong tries.';

/**
 * Room passphrase input, masked by default.
 *   generate: true  → pre-filled with generated words and a ↻ button; `enough` says in plain
 *                     words that they're strong enough, and a strength meter (an estimate) only
 *                     appears once the passphrase is edited
 *   generate: false → empty field for the passphrase someone gave you
 * Nothing is normalised: what is typed must match exactly (callers only trim the ends).
 */
export function passphraseField({ generate, enough = 'Strong enough ✓', context = ROOM_CONTEXT, label = 'Passphrase' }: {
  generate: boolean; enough?: string; context?: string | null; label?: string;
}): { input: HTMLInputElement; el: HTMLElement } {
  const input = secretInput({
    spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off', class: 'mono', required: true, 'aria-label': label,
  });
  const controls: HTMLElement[] = [input, revealToggle(input)];
  let meter: StrengthMeter | null = null;
  let ok: HTMLElement | null = null;
  if (generate) {
    const m = strengthMeter();
    const okLine = h('p', { class: 'hint passphrase-ok' }, enough);
    meter = m;
    ok = okLine;
    let generated = '';
    const refresh = () => {
      const isGenerated = input.value === generated;
      okLine.hidden = !isGenerated;
      m.el.hidden = isGenerated;
      if (!input.value) m.set(null);
      else if (!isGenerated) m.set(estimateBits(input.value), { estimated: true });
    };
    const regenerate = () => { generated = roomPassphrase(); input.value = generated; refresh(); };
    input.addEventListener('input', refresh);
    controls.push(h('button', { type: 'button', class: 'btn btn-ghost', title: 'Generate another', onclick: regenerate }, '↻'));
    regenerate();
  }
  const hint = generate && context ? h('p', { class: 'hint' }, context) : null;
  return { input, el: h('div', null, h('div', { class: 'row grow tight' }, ...controls), ok, meter?.el, hint) };
}

/** Read-only value with a Copy button; secrets are masked, with a Show toggle. */
export function copyRow(label: string, value: string, secret: boolean): HTMLElement {
  const attrs = { readOnly: true, value, class: 'mono', 'aria-label': label };
  const input = secret ? secretInput(attrs) : h('input', { type: 'text', ...attrs });
  const btn = h('button', { class: 'btn btn-small', onclick: () => copyText(value, btn) }, 'Copy');
  return field(label, h('div', { class: 'row grow tight' }, input, secret ? revealToggle(input) : null, btn));
}

let fieldIds = 0;

/**
 * A labelled form field. The label is tied to the control (or to the first input, textarea or
 * select inside it) with for/id, so screen readers announce it and clicking it focuses the field.
 */
export function field(label: string, control: HTMLElement, ...rest: Child[]): HTMLElement {
  const target = control.matches('input, textarea, select')
    ? control
    : control.querySelector<HTMLElement>('input:not([type=hidden]), textarea, select');
  const lbl = h('label', null, label);
  if (target) {
    if (!target.id) target.id = `field-${++fieldIds}`;
    lbl.htmlFor = target.id;
  }
  return h('div', { class: 'field' }, lbl, control, ...rest);
}
