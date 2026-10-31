// Encrypted files (roadmap 0.12.0): encrypt files or a folder with a password into one OpenPGP
// file, and decrypt one, all in the browser. Nothing is uploaded or stored. The library loads once
// the page is usable (loadWhenIdle), and both work offline from then on. The format and its settings are in
// lib/files.ts; how to open the file elsewhere is on the static page (src/pages/files.html).
import { h, formatBytes } from '../lib/dom.js';
import {
  MAX_PACKAGE_BYTES, MAX_PACKAGE_LABEL, PACKAGE_NAME, packageFiles, counted, encrypt, decrypt, collect, encryptedName, decryptedName,
  decryptErrorReason, type DecryptError, type OpenPGPModule, type MakeZip, type PackageEntry,
} from '../lib/files.js';
import { estimateBits } from '../lib/strength.js';
import { loadOpenPGP } from '../vendor/openpgp.js';
import { loadZip } from '../vendor/zip.js';
import { pageUrl } from '../lib/nav.js';
import { passphraseField, copyRow, field } from './widgets.js';

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const NOT_LOADED = 'The encryption library didn’t load. Reload the page while online, then try again.';

/** Typed passwords estimated below this get a warning: the file can be attacked offline. */
const WEAK_BITS = 50;

export const DECRYPT_ERRORS: Record<DecryptError, string> = {
  password: 'That password doesn’t open this file. Check that it’s typed exactly as you were given it, with the same spaces and capitals.',
  // Also what a wrong password gives, now and then (see DecryptError).
  damaged: 'This file didn’t open: either the password isn’t exactly right, or the file was damaged or changed after it was encrypted, and then nothing in it can be trusted. Check the password first; if it’s right, ask for a new copy.',
  'not-openpgp': 'This isn’t a file encrypted with a password in the OpenPGP format (.gpg, .pgp or .asc), so it can’t be opened here.',
  'public-key': 'This file was encrypted for someone’s key, not with a password. Open it with GnuPG or Kleopatra and the matching private key: this page only handles passwords for now.',
  'too-large': `This page handles files up to ${MAX_PACKAGE_LABEL}. Open larger ones with GnuPG.`,
};

/** How long after the page has loaded the library is fetched anyway, if nobody has touched the tool. */
const LOAD_AFTER_MS = 3000;

/** The two libraries the page needs, loaded together. */
interface Libraries { pgp: OpenPGPModule; zip: MakeZip }

/**
 * Loads openpgp.js (about 130 KB compressed) and client-zip once the page is usable, not while it's loading, so it
 * doesn't hold up the first paint on a phone: on the first touch, key or drop on the tool, or a few
 * seconds after the page has loaded. From then on, the page works offline. root gets
 * data-offline="ready" when it's loaded.
 */
function loadWhenIdle(root: HTMLElement): Promise<Libraries> {
  let start!: () => void;
  const started = new Promise<void>((resolve) => { start = resolve; });
  const events = ['pointerdown', 'keydown', 'focusin', 'dragenter'] as const;
  events.forEach((e) => root.addEventListener(e, start, { once: true, passive: true }));
  const later = () => setTimeout(start, LOAD_AFTER_MS);
  if (document.readyState === 'complete') later();
  else window.addEventListener('load', later, { once: true });
  const libs = started.then(async () => {
    const [pgp, zip] = await Promise.all([loadOpenPGP(), loadZip()]);
    return { pgp, zip };
  });
  libs.then(() => { root.dataset.offline = 'ready'; }, () => { /* reported when it's needed */ });
  return libs;
}

export function mount(root: HTMLElement): () => void {
  const libs = loadWhenIdle(root);
  const urls: string[] = [];
  const keep = (blob: Blob): string => { const u = URL.createObjectURL(blob); urls.push(u); return u; };

  const encryptTab = h('button', { type: 'button', class: 'tab', 'aria-pressed': 'true' }, 'Encrypt files');
  const decryptTab = h('button', { type: 'button', class: 'tab', 'aria-pressed': 'false' }, 'Decrypt a file');
  const body = h('div');
  const show = (mode: 'encrypt' | 'decrypt') => {
    encryptTab.setAttribute('aria-pressed', String(mode === 'encrypt'));
    decryptTab.setAttribute('aria-pressed', String(mode === 'decrypt'));
    body.replaceChildren(mode === 'encrypt' ? encryptForm(libs, keep, () => show('encrypt')) : decryptForm(libs, keep, () => show('decrypt')));
  };
  encryptTab.addEventListener('click', () => show('encrypt'));
  decryptTab.addEventListener('click', () => show('decrypt'));

  root.append(
    h('section', { class: 'page-head' },
      h('h1', null, 'Encrypted files'),
      h('p', { class: 'lead' }, 'Encrypt files with a password into one file that only the password opens, or decrypt one. It all happens in your browser: nothing is uploaded.')),
    h('div', { class: 'tabs', role: 'group', 'aria-label': 'What do you want to do?' }, encryptTab, decryptTab),
    body,
  );
  show('encrypt');
  return () => { delete root.dataset.offline; urls.forEach((u) => URL.revokeObjectURL(u)); };
}

// ---------------------------------------------------------------- adding files

/** Every file under a dropped folder, with its path from the folder. */
async function entriesOf(entry: FileSystemEntry, prefix = ''): Promise<PackageEntry[]> {
  const path = prefix + entry.name;
  if (entry.isFile) {
    const file = await new Promise<File>((ok, fail) => (entry as FileSystemFileEntry).file(ok, fail));
    return [{ path, file, modified: file.lastModified }];
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const children: FileSystemEntry[] = [];
  // readEntries returns the folder in batches, until an empty one.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((ok, fail) => reader.readEntries(ok, fail));
    if (!batch.length) break;
    children.push(...batch);
  }
  children.sort((a, b) => a.name.localeCompare(b.name));
  const nested = await Promise.all(children.map((c) => entriesOf(c, `${path}/`)));
  return nested.flat();
}

/** What was dropped: files, and folders with everything in them where the browser allows it. */
async function dropped(data: DataTransfer | null): Promise<PackageEntry[]> {
  if (!data) return [];
  const items = Array.from(data.items ?? []).filter((i) => i.kind === 'file');
  const entries = items.map((i) => i.webkitGetAsEntry?.() ?? null);
  if (entries.length && entries.every(Boolean)) return (await Promise.all(entries.map((e) => entriesOf(e!)))).flat();
  return Array.from(data.files).map((file) => ({ path: file.name, file, modified: file.lastModified }));
}

const fromInput = (list: FileList | null): PackageEntry[] => Array.from(list ?? []).map((file) => ({
  // A folder chosen with webkitdirectory gives each file its path from that folder.
  path: file.webkitRelativePath || file.name, file, modified: file.lastModified,
}));

/** Makes a card accept dropped files. */
function dropTarget(card: HTMLElement, onDrop: (data: DataTransfer | null) => void): void {
  card.addEventListener('dragover', (e) => { e.preventDefault(); card.classList.add('over'); });
  card.addEventListener('dragleave', (e) => { if (!card.contains(e.relatedTarget as Node | null)) card.classList.remove('over'); });
  card.addEventListener('drop', (e) => { e.preventDefault(); card.classList.remove('over'); onDrop(e.dataTransfer); });
}

function progressView(): { el: HTMLElement; set(text: string, fraction?: number): void } {
  const bar = h('progress', { max: 1, value: 0, 'aria-label': 'Progress' });
  const status = h('p', { class: 'hint', role: 'status', 'aria-live': 'polite' });
  const el = h('div', { class: 'file-progress', hidden: true }, bar, status);
  return {
    el,
    set(text, fraction) {
      el.hidden = false;
      status.textContent = text;
      if (fraction == null) bar.removeAttribute('value');
      else bar.value = Math.min(fraction, 1);
    },
  };
}

function fileCard(name: string, size: number, url: string, label: string): HTMLElement {
  return h('div', { class: 'file-card' },
    h('span', { class: 'file-icon', 'aria-hidden': 'true' }, '📄'),
    h('div', { class: 'file-info' }, h('strong', null, name), h('span', { class: 'muted' }, formatBytes(size))),
    h('a', { class: 'btn btn-primary btn-tap', href: url, download: name }, label));
}

/** Replaces the form with its result, and takes focus (and the screen) to the result's heading. */
function showResult(form: HTMLElement, result: HTMLElement): void {
  form.replaceWith(result);
  const heading = result.querySelector('h2');
  heading?.setAttribute('tabindex', '-1');
  heading?.focus({ preventScroll: true });
  result.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

/** Scrolls to the static instructions under the tool (an in-page link would re-mount it). */
function openElsewhereLink(): HTMLElement {
  return h('button', { type: 'button', class: 'link-button', onclick: () => {
    document.getElementById('open-elsewhere')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } }, 'How to open it without this site ›');
}

// ---------------------------------------------------------------- F1: encrypt

function encryptForm(libraries: Promise<Libraries>, keep: (b: Blob) => string, again: () => void): HTMLElement {
  let entries: PackageEntry[] = [];
  const list = h('ul', { class: 'file-list' });
  const summary = h('p', { class: 'hint' });
  const pickFiles = h('input', { type: 'file', multiple: true, hidden: true, 'aria-label': 'Files to encrypt',
    onchange: (e: Event) => { const t = e.target as HTMLInputElement; add(fromInput(t.files)); t.value = ''; } });
  const pickFolder = h('input', { type: 'file', multiple: true, hidden: true, webkitdirectory: true, 'aria-label': 'Folder to encrypt',
    onchange: (e: Event) => { const t = e.target as HTMLInputElement; add(fromInput(t.files)); t.value = ''; } });
  const pass = passphraseField({
    generate: true, label: 'Password', enough: 'Strong enough to protect this file ✓',
    context: 'Anyone who gets the file can try passwords as fast as their computer allows, so use the suggested words or something at least as long.',
  });
  const weak = h('p', { class: 'warning', hidden: true },
    'This password is easy to guess for someone who has the file. Use the suggested words (↻ for others), or a longer passphrase.');
  pass.input.addEventListener('input', () => { weak.hidden = !pass.input.value || estimateBits(pass.input.value) >= WEAK_BITS; });
  const error = h('p', { class: 'error', role: 'alert', hidden: true });
  const progress = progressView();
  const submit = h('button', { class: 'btn btn-primary btn-tap', type: 'submit' }, 'Encrypt');

  const total = () => entries.reduce((n, e) => n + e.file.size, 0);
  function add(more: PackageEntry[]): void {
    error.hidden = true;
    entries = [...entries, ...more];
    render();
  }
  function render(): void {
    list.replaceChildren(...entries.map((e, i) => h('li', null,
      h('span', null, '📄 ', e.path), h('span', { class: 'muted' }, formatBytes(e.file.size)),
      h('button', { type: 'button', class: 'btn btn-ghost btn-small', 'aria-label': `Remove ${e.path}`,
        onclick: () => { entries = entries.filter((_, j) => j !== i); render(); } }, '✕'))));
    summary.textContent = entries.length > 1
      ? `${entries.length} files, ${formatBytes(total())}: they’ll be packaged as one ZIP (${PACKAGE_NAME}) inside the encrypted file.`
      : '';
    summary.hidden = entries.length < 2;
  }
  const fail = (msg: string): void => {
    error.textContent = msg;
    error.hidden = false;
    progress.el.hidden = true;
    submit.disabled = false;
  };

  const form = h('form', { class: 'card narrow', onsubmit: async (e: Event) => {
    e.preventDefault();
    error.hidden = true;
    const password = pass.input.value.trim();
    if (!entries.length) return fail('Add at least one file or a folder.');
    if (!password) return fail('Choose a password.');
    if (total() > MAX_PACKAGE_BYTES) return fail(`That’s ${formatBytes(total())}: this page encrypts up to ${MAX_PACKAGE_LABEL} in all.`);
    submit.disabled = true;
    const lib = await libraries.catch(() => null);
    if (!lib) return fail(NOT_LOADED);
    try {
      const pkg = packageFiles(entries, lib.zip);
      progress.set('Encrypting…', 0);
      const input = counted(pkg.stream, (n) => progress.set(`Encrypting… ${Math.min(99, Math.floor((n / pkg.size) * 100))}%`, n / pkg.size));
      const blob = await collect(await encrypt(lib.pgp, input, pkg.name, password));
      showResult(form, encryptedView(encryptedName(pkg.name), blob, keep(blob), password, again));
    } catch (err) {
      fail(`Could not encrypt: ${errorText(err)}`);
    }
  } },
  h('div', { class: 'row' },
    h('button', { type: 'button', class: 'btn btn-tap', onclick: () => pickFiles.click() }, '+ Add files'),
    h('button', { type: 'button', class: 'btn btn-tap', onclick: () => pickFolder.click() }, '+ Add a folder'),
    pickFiles, pickFolder,
    h('span', { class: 'hint inline' }, 'or drop them here')),
  list, summary,
  field('Password', pass.el), weak,
  h('p', { class: 'notice lost-password' }, h('strong', null, 'Keep the password safe. '),
    'If it’s lost, nobody can open the file, not even us. Write it down or keep it in a password manager.'),
  error,
  h('div', { class: 'row' }, submit),
  progress.el,
  h('p', { class: 'hint' }, `Up to ${MAX_PACKAGE_LABEL} in all. The file is OpenPGP (AES-256), so GnuPG, Kleopatra and GPG Suite open it too.`),
  );
  summary.hidden = true;
  dropTarget(form, (data) => { void dropped(data).then(add, (err) => fail(`Could not read what was dropped: ${errorText(err)}`)); });
  return form;
}

function encryptedView(name: string, blob: Blob, url: string, password: string, again: () => void): HTMLElement {
  return h('section', { class: 'card narrow result' },
    h('h2', null, 'Your encrypted file is ready'),
    fileCard(name, blob.size, url, 'Download'),
    copyRow('Password', password, true),
    h('p', { class: 'hint' }, 'Keep it where you like: your cloud storage, a USB stick, a backup. To give it to someone, ',
      h('a', { href: pageUrl('share') }, 'send it with Secure Share'),
      ' rather than by email, where copies stay on servers, and give the password another way.'),
    h('p', { class: 'hint' }, openElsewhereLink()),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onclick: again }, 'Encrypt other files')),
  );
}

// ---------------------------------------------------------------- F2: decrypt

function decryptForm(libraries: Promise<Libraries>, keep: (b: Blob) => string, again: () => void): HTMLElement {
  let file: File | null = null;
  const chosen = h('ul', { class: 'file-list' });
  const pick = h('input', { type: 'file', hidden: true, accept: '.gpg,.pgp,.asc,application/pgp-encrypted', 'aria-label': 'Encrypted file',
    onchange: (e: Event) => { const t = e.target as HTMLInputElement; choose(t.files?.[0] ?? null); t.value = ''; } });
  const pass = passphraseField({ generate: false, label: 'Password' });
  const error = h('p', { class: 'error', role: 'alert', hidden: true });
  const progress = progressView();
  const submit = h('button', { class: 'btn btn-primary btn-tap', type: 'submit' }, 'Decrypt');

  function choose(f: File | null): void {
    if (!f) return;
    file = f;
    error.hidden = true;
    chosen.replaceChildren(h('li', null, h('span', null, '🔒 ', f.name), h('span', { class: 'muted' }, formatBytes(f.size))));
    pass.input.focus();
  }
  const fail = (msg: string): void => {
    error.textContent = msg;
    error.hidden = false;
    progress.el.hidden = true;
    submit.disabled = false;
  };

  const form = h('form', { class: 'card narrow', onsubmit: async (e: Event) => {
    e.preventDefault();
    error.hidden = true;
    const password = pass.input.value.trim();
    if (!file) return fail('Choose the encrypted file first.');
    if (!password) return fail('Type the password.');
    submit.disabled = true;
    const encrypted = file;
    const lib = await libraries.catch(() => null);
    if (!lib) return fail(NOT_LOADED);
    try {
      progress.set('Checking the password…');
      const { data, name } = await decrypt(lib.pgp, encrypted, password,
        (n) => progress.set(`Decrypting… ${Math.min(99, Math.floor((n / encrypted.size) * 100))}%`, n / encrypted.size));
      // Nothing is offered until the whole file is decrypted and its integrity check has passed.
      const blob = await collect(data);
      showResult(form, decryptedView(decryptedName(name, encrypted.name), blob, keep(blob), again));
    } catch (err) {
      fail(DECRYPT_ERRORS[decryptErrorReason(err)]);
    }
  } },
  h('div', { class: 'row' },
    h('button', { type: 'button', class: 'btn btn-tap', onclick: () => pick.click() }, 'Choose the encrypted file'),
    pick,
    h('span', { class: 'hint inline' }, 'or drop it here')),
  chosen,
  field('Password', pass.el, h('p', { class: 'hint' }, 'Exactly as you were given it.')),
  error,
  h('div', { class: 'row' }, submit),
  progress.el,
  h('p', { class: 'hint' }, 'Files encrypted with a password by this page, GnuPG, Kleopatra or GPG Suite (.gpg, .pgp or .asc), up to ', MAX_PACKAGE_LABEL, '.'),
  );
  dropTarget(form, (data) => choose(data?.files[0] ?? null));
  return form;
}

function decryptedView(name: string, blob: Blob, url: string, again: () => void): HTMLElement {
  const zip = /\.zip$/i.test(name);
  return h('section', { class: 'card narrow result' },
    h('h2', null, 'Here’s what was inside'),
    fileCard(name, blob.size, url, 'Download'),
    zip ? h('p', { class: 'hint' }, 'It’s a ZIP package of several files or a folder: open it once it’s downloaded to see everything inside.') : null,
    h('p', { class: 'hint' }, 'Nothing was uploaded or kept: the decrypted file exists only in this page until you download it, and it’s gone when you leave.'),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onclick: again }, 'Decrypt another file')),
  );
}
