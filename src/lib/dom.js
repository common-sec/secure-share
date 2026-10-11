// Tiny DOM builder. All text goes through text nodes, never innerHTML.
const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'readOnly', 'multiple', 'hidden']);

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (PROPS.has(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    if (button) flash(button, 'Copied ✓');
    return true;
  } catch {
    if (button) flash(button, 'Copy failed');
    return false;
  }
}

function flash(button, label) {
  const original = button.dataset.label ?? button.textContent;
  button.dataset.label = original;
  button.textContent = label;
  clearTimeout(button._flashTimer);
  button._flashTimer = setTimeout(() => { button.textContent = original; }, 1500);
}

export function safeFileName(name) {
  const cleaned = String(name ?? 'file').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 200);
  return cleaned || 'file';
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < units.length - 1);
  return `${n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`;
}
