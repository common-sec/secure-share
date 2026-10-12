// Tiny DOM builder. All text goes through text nodes, never innerHTML.

export type Child = Node | string | number | null | undefined | false | Child[];
export type Attrs = Record<string, unknown> | null | undefined;

const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'readOnly', 'multiple', 'hidden']);

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (PROPS.has(k)) (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

function append(el: HTMLElement, children: Child[]): void {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export async function copyText(text: string, button?: HTMLElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    if (button) flash(button, 'Copied ✓');
    return true;
  } catch {
    if (button) flash(button, 'Copy failed');
    return false;
  }
}

const flashTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

function flash(button: HTMLElement, label: string): void {
  const original = button.dataset.label ?? button.textContent ?? '';
  button.dataset.label = original;
  button.textContent = label;
  clearTimeout(flashTimers.get(button));
  flashTimers.set(button, setTimeout(() => { button.textContent = original; }, 1500));
}

export function safeFileName(name: unknown): string {
  const cleaned = String(name ?? 'file').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 200);
  return cleaned || 'file';
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < units.length - 1);
  return `${n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`;
}
