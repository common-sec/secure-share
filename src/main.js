import * as home from './tools/home.js';
import * as password from './tools/password.js';
import * as chat from './tools/chat.js';
import * as share from './tools/share.js';

const routes = {
  '': { mod: home, title: 'User Sec Tools' },
  password: { mod: password, title: 'Password Generator · User Sec Tools' },
  chat: { mod: chat, title: 'Secure Chat · User Sec Tools' },
  share: { mod: share, title: 'Secure Share · User Sec Tools' },
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
  const route = routes[name] ?? routes[''];
  document.title = route.title;
  for (const a of document.querySelectorAll('.nav a')) {
    a.classList.toggle('active', a.dataset.route === name);
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
