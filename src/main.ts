import * as password from './tools/password.js';
import * as chat from './tools/chat.js';
import * as share from './tools/share.js';
import { APP_NAME } from './lib/app.js';

/** Set at build time by build.mjs: package.json version + short commit, e.g. "0.6.0+1a2b3c4". */
declare const __APP_VERSION__: string;
/** Set at build time by build.mjs from $BUILD_REPOSITORY: where this build's source lives. */
declare const __REPOSITORY__: string;

export { APP_NAME };
const REPOSITORY = __REPOSITORY__;

interface Route {
  mod: { mount(root: HTMLElement, params: URLSearchParams): (() => void) | void };
  title: string;
}

// Secure Share is the home page; the title names the tool in use.
const routes: Record<string, Route> = {
  share: { mod: share, title: `${APP_NAME} · Send passwords and files securely` },
  chat: { mod: chat, title: `Secure Chat · ${APP_NAME}` },
  password: { mod: password, title: `Password Generator · ${APP_NAME}` },
};

let cleanup: (() => void) | void;

function parseHash(): { name: string; params: URLSearchParams } {
  const raw = location.hash.replace(/^#\/?/, '');
  const qIndex = raw.indexOf('?');
  const path = qIndex === -1 ? raw : raw.slice(0, qIndex);
  const query = qIndex === -1 ? '' : raw.slice(qIndex + 1);
  return { name: path.replace(/\/+$/, ''), params: new URLSearchParams(query) };
}

function render(): void {
  if (typeof cleanup === 'function') cleanup();
  cleanup = undefined;

  const view = document.getElementById('view')!;
  view.replaceChildren();

  const { name, params } = parseHash();
  const key = name in routes ? name : 'share';
  const route = routes[key]!;
  document.title = route.title;
  for (const a of document.querySelectorAll<HTMLElement>('.nav a')) {
    a.classList.toggle('active', a.dataset.route === key);
  }
  cleanup = route.mod.mount(view, params);
  window.scrollTo(0, 0);
}

/** Shows which build is running, linking to the exact commit (compare with the release's SHA256SUMS). */
function showVersion(): void {
  const el = document.getElementById('version');
  if (!el) return;
  const [release, commit] = __APP_VERSION__.split('+');
  const link = document.createElement('a');
  link.href = commit && commit !== 'unknown' ? `${REPOSITORY}/commit/${commit}` : REPOSITORY;
  link.rel = 'noopener';
  link.textContent = `v${release}${commit ? ` · build ${commit}` : ''}`;
  el.replaceChildren(link);
}

window.addEventListener('hashchange', render);
showVersion();

if (!window.isSecureContext || !globalThis.crypto?.subtle) {
  document.getElementById('view')!.textContent =
    'This app requires a secure context (HTTPS or localhost) to access the Web Crypto API.';
} else {
  render();
}
