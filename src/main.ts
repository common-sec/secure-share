import * as password from './tools/password.js';
import * as chat from './tools/chat.js';
import * as share from './tools/share.js';
import * as files from './tools/files.js';
import { APP_NAME } from './lib/app.js';
import { fragmentParams, legacyRedirect } from './lib/nav.js';

export { APP_NAME };

interface Tool { mount(root: HTMLElement, params: URLSearchParams): (() => void) | void }

// Each tool has its own pre-rendered page (built by pages.mjs), which names the tool to mount in
// <body data-tool>. The page's static content is what crawlers and link previews see; the tool
// replaces the static heading in #view, and the fragment holds the room secrets or settings.
const tools: Record<string, Tool> = { share, chat, files, password };

let cleanup: (() => void) | void;
const pageTitle = document.title;

function render(): void {
  if (typeof cleanup === 'function') cleanup();
  cleanup = undefined;

  const view = document.getElementById('view')!;
  view.replaceChildren();
  document.title = pageTitle;   // tools may change it (a received Share), so start from the page's

  const params = fragmentParams();
  // Someone who opened a room link sees the tool only, not the page's introduction.
  const about = document.getElementById('about');
  if (about) about.hidden = params.has('r');
  cleanup = tools[document.body.dataset.tool ?? '']?.mount(view, params);
  window.scrollTo(0, 0);
}

const moved = legacyRedirect(location.hash);
if (moved) {
  // A link from before the static pages (`/#/chat?r=…`): same secrets, new address.
  location.replace(moved);
} else if (!window.isSecureContext || !globalThis.crypto?.subtle) {
  document.getElementById('view')!.textContent =
    'This app requires a secure context (HTTPS or localhost) to access the Web Crypto API.';
} else {
  window.addEventListener('hashchange', render);
  render();
}
