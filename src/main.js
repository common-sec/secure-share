import * as password from './tools/password.js';
import * as chat from './tools/chat.js';
import * as share from './tools/share.js';

export const APP_NAME = 'Secure Sharing';

// Secure Share is the home page; the title names the tool in use.
const routes = {
  share: { mod: share, title: `Share once · ${APP_NAME}` },
  chat: { mod: chat, title: `Chat · ${APP_NAME}` },
  password: { mod: password, title: `Passwords · ${APP_NAME}` },
};

let cleanup = null;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const qIndex = raw.indexOf('?');
  const path = qIndex === -1 ? raw : raw.slice(0, qIndex);
  const query = qIndex === -1 ? '' : raw.slice(qIndex + 1);
  return { name: path.replace(/\/+$/, ''), params: new URLSearchParams(query) };
}

function render() {
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;

  const view = document.getElementById('view');
  view.replaceChildren();

  const { name, params } = parseHash();
  const key = routes[name] ? name : 'share';
  const route = routes[key];
  document.title = route.title;
  for (const a of document.querySelectorAll('.nav a')) {
    a.classList.toggle('active', a.dataset.route === key);
  }
  cleanup = route.mod.mount(view, params);
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);

if (!window.isSecureContext || !globalThis.crypto?.subtle) {
  document.getElementById('view').textContent =
    'This app requires a secure context (HTTPS or localhost) to access the Web Crypto API.';
} else {
  render();
}
