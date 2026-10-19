// UI pieces shared by the tools.
import { h, copyText, type Child } from '../lib/dom.js';
import { roomPassphrase, phraseEntropy, ROOM_PHRASE } from '../lib/passphrase.js';
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

/** A Show/Hide button that toggles an input between masked and visible. */
export function revealToggle(input: HTMLInputElement): HTMLButtonElement {
  const btn = h('button', { type: 'button', class: 'btn btn-ghost', 'aria-pressed': 'false' }, 'Show');
  btn.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.textContent = show ? 'Hide' : 'Show';
    btn.setAttribute('aria-pressed', String(show));
  });
  return btn;
}

/**
 * Room passphrase input, masked by default.
 *   generate: true  → pre-filled with a generated passphrase, a ↻ button and a strength meter
 *                     (exact for generated values, an estimate once edited)
 *   generate: false → empty field for the passphrase someone gave you
 */
export function passphraseField({ generate }: { generate: boolean }): { input: HTMLInputElement; el: HTMLElement } {
  const input = h('input', {
    type: 'password', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off',
    class: 'mono', required: true, 'aria-label': 'Passphrase',
  });
  const controls: HTMLElement[] = [input, revealToggle(input)];
  let meter: StrengthMeter | null = null;
  if (generate) {
    const m = strengthMeter();
    meter = m;
    let generated = '';
    const refresh = () => {
      if (!input.value) m.set(null);
      else if (input.value === generated) m.set(phraseEntropy(ROOM_PHRASE));
      else m.set(estimateBits(input.value), { estimated: true });
    };
    const regenerate = () => { generated = roomPassphrase(); input.value = generated; refresh(); };
    input.addEventListener('input', refresh);
    controls.push(h('button', { type: 'button', class: 'btn btn-ghost', title: 'Generate another', onclick: regenerate }, '↻'));
    regenerate();
  }
  const context = generate ? h('p', { class: 'hint' },
    'A generated passphrase is plenty for a room: it can only be guessed live, against your browser, and the room locks after 5 wrong tries.') : null;
  return { input, el: h('div', null, h('div', { class: 'row grow tight' }, ...controls), meter?.el, context) };
}

/** Read-only value with a Copy button; secrets are masked, with a Show toggle. */
export function copyRow(label: string, value: string, secret: boolean): HTMLElement {
  const input = h('input', { type: secret ? 'password' : 'text', readOnly: true, value, class: 'mono', 'aria-label': label });
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
