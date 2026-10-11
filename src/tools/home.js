import { h } from '../lib/dom.js';

export function mount(root) {
  root.append(
    h('section', { class: 'hero' },
      h('h1', null, 'Small, honest security tools'),
      h('p', { class: 'lead' },
        'Everything runs in your browser. Nothing you generate or share is sent to a server we control.'),
    ),
    h('div', { class: 'cards' },
      card('#/password', '🔑', 'Password Generator',
        'Memorable passphrases or random character passwords. Save your settings as a link.'),
      card('#/chat', '💬', 'Secure Chat',
        'End-to-end encrypted group chat with file sharing, browser to browser. The host approves who joins.'),
      card('#/share', '📦', 'Secure Share',
        'Send text or files once to one person, protected by a link plus a passphrase. Nothing is stored anywhere.'),
    ),
  );
}

function card(href, icon, title, body) {
  return h('a', { class: 'card card-link', href },
    h('div', { class: 'card-icon', 'aria-hidden': 'true' }, icon),
    h('h2', null, title),
    h('p', null, body),
    h('span', { class: 'card-cta' }, 'Open →'),
  );
}
