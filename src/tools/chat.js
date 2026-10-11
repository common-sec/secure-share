import { h, copyText, formatBytes, safeFileName } from '../lib/dom.js';
import { roomPassphrase } from '../lib/passphrase.js';
import { SecureRoom, DENY_REASONS, MAX_TEXT, MAX_FILE_BYTES, cleanNick } from '../lib/room.js';
import { saveHost, loadHost, forgetHost, claimHost } from '../lib/hoststore.js';

// Per-tab conveniences (sessionStorage is cleared when the tab closes).
const tabStore = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* unavailable */ } },
  del(k) { try { sessionStorage.removeItem(k); } catch { /* unavailable */ } },
};

const LINK_RE = { r: /^[A-Za-z0-9_-]{22}$/, k: /^[A-Za-z0-9_-]{43}$/, h: /^[A-Za-z0-9_-]{43}$/ };

export function readInvite(params) {
  const inv = { roomId: params.get('r'), secret: params.get('k'), hostFp: params.get('h') };
  const ok = LINK_RE.r.test(inv.roomId ?? '') && LINK_RE.k.test(inv.secret ?? '') && LINK_RE.h.test(inv.hostFp ?? '');
  return ok ? inv : null;
}

export function passphraseField(value) {
  const input = h('input', { type: 'text', value, spellcheck: 'false', autocomplete: 'off', class: 'mono', required: true });
  const regen = h('button', { type: 'button', class: 'btn btn-ghost', title: 'Generate another', onclick: () => { input.value = roomPassphrase(); } }, '↻');
  return { input, el: h('div', { class: 'row grow tight' }, input, value !== '' ? regen : null) };
}

export function mount(root, params) {
  let session = null;
  let disposed = false;
  const invite = readInvite(params);

  const showForm = () => {
    root.replaceChildren();
    const nick = h('input', { type: 'text', maxlength: 32, placeholder: 'e.g. Alice', autocomplete: 'nickname', required: true, value: tabStore.get('uss-nick') ?? '' });
    const pass = passphraseField(invite ? '' : roomPassphrase());
    const error = h('p', { class: 'error', hidden: true });
    const submit = h('button', { class: 'btn btn-primary', type: 'submit' }, invite ? 'Join chat' : 'Create chat room');

    const form = h('form', { class: 'card narrow', onsubmit: async (e) => {
      e.preventDefault();
      const n = cleanNick(nick.value);
      const p = pass.input.value.trim();
      if (!n || !p) { error.textContent = 'Nickname and passphrase are both required.'; error.hidden = false; return; }
      submit.disabled = true;
      submit.textContent = 'Deriving keys…';
      tabStore.set('uss-nick', n);
      try {
        session = await startChat(root, { invite, nick: n, passphrase: p, onRetry: showForm });
      } catch (err) {
        error.textContent = `Could not start: ${err.message}`;
        error.hidden = false;
        submit.disabled = false;
        submit.textContent = invite ? 'Join chat' : 'Create chat room';
      }
    } },
    h('h2', null, invite ? 'You’re invited to a secure chat' : 'Start a secure chat'),
    h('div', { class: 'field' }, h('label', null, 'Your nickname'), nick),
    h('div', { class: 'field' }, h('label', null, 'Room passphrase'), pass.el,
      h('p', { class: 'hint' }, invite
        ? 'The host should have given you this separately from the link.'
        : 'Share this with your guests separately from the link, e.g. say it on a call.')),
    error,
    h('div', { class: 'row' }, submit),
    );

    root.append(
      h('section', { class: 'page-head' },
        h('h1', null, 'Secure Chat'),
        h('p', { class: 'lead' }, 'Group chat and file sharing, browser to browser, end-to-end encrypted. No account, no server storage.'),
      ),
      form,
      h('ul', { class: 'facts' },
        h('li', null, '🔑 Joining needs both the link and the passphrase.'),
        h('li', null, '✋ The host approves every person who joins.'),
        h('li', null, '🔢 Safety codes let you confirm no one is intercepting the connection.'),
      ),
    );
    nick.focus();
  };

  if (invite) {
    // Is this our own room, reloaded? Then resume hosting instead of joining it as a guest.
    (async () => {
      const saved = await loadHost('chat', invite.roomId, invite.hostFp);
      const release = saved ? await claimHost('chat', invite.roomId) : null;
      if (disposed) return release?.();
      if (!saved || !release) return showForm();
      try {
        session = await startChat(root, { restore: saved, release, onRetry: showForm });
      } catch {
        release();
        showForm();
      }
    })();
  } else {
    showForm();
  }
  return () => { disposed = true; session?.leave(); };
}

async function startChat(root, { invite, nick, passphrase, restore, release, onRetry }) {
  let room;
  if (restore) room = await SecureRoom.host({ app: 'chat', restore, maxGuests: 7 });
  else if (invite) room = await SecureRoom.join({ app: 'chat', ...invite, passphrase, nick });
  else room = await SecureRoom.host({ app: 'chat', passphrase, nick, maxGuests: 7 });

  const link = room.isHost ? room.link('chat') : null;
  if (room.isHost) {
    // Keep the room link in the address bar and make a reload resume the room.
    release ??= await claimHost('chat', room.roomId);
    history.replaceState(null, '', link.slice(link.indexOf('#')));
    const persist = () => saveHost('chat', room.snapshot());
    persist();
    room.on('persist', persist);
    if (passphrase) tabStore.set(`uss-pass:${room.roomId}`, passphrase);
    else passphrase = tabStore.get(`uss-pass:${room.roomId}`);
  }
  const objectUrls = [];
  const fileCards = new Map();

  // ---- layout ----
  const badge = h('span', { class: room.isHost ? 'badge badge-host' : 'badge' }, room.isHost ? '★ You are the host' : 'Connecting to host…');
  const requests = h('div', { class: 'requests' });
  const messages = h('ol', { class: 'messages', 'aria-live': 'polite' });
  const input = h('textarea', { rows: 1, placeholder: 'Write a message…', maxlength: MAX_TEXT, disabled: true });
  const sendBtn = h('button', { class: 'btn btn-primary', disabled: true, onclick: sendText, title: 'Send (Enter)' }, 'Send');
  const fileInput = h('input', { type: 'file', multiple: true, hidden: true, onchange: (e) => { sendFiles(e.target.files); e.target.value = ''; } });
  const attachBtn = h('button', { class: 'btn btn-ghost attach', disabled: true, title: `Attach files (up to ${formatBytes(MAX_FILE_BYTES)})`, onclick: () => fileInput.click() }, '📎');
  const memberList = h('ul', { class: 'members' });
  const lockToggle = h('input', { type: 'checkbox', onchange: (e) => room.setLocked(e.target.checked) });

  const chatPane = h('section', { class: 'chat-main' },
    requests,
    messages,
    h('div', { class: 'composer' }, attachBtn, fileInput, input, sendBtn),
  );
  chatPane.addEventListener('dragover', (e) => { if (!input.disabled) { e.preventDefault(); chatPane.classList.add('over'); } });
  chatPane.addEventListener('dragleave', (e) => { if (e.target === chatPane) chatPane.classList.remove('over'); });
  chatPane.addEventListener('drop', (e) => { e.preventDefault(); chatPane.classList.remove('over'); if (!input.disabled) sendFiles(e.dataTransfer.files); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); } });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 200)}px`; });

  const side = h('aside', { class: 'chat-side' },
    room.isHost ? h('div', { class: 'panel' },
      h('h3', null, 'Invite'),
      copyRow('Link', link, true),
      passphrase
        ? copyRow('Passphrase', passphrase, false)
        : h('p', { class: 'hint' }, 'Passphrase: the one you chose when creating the room (not kept after closing the tab).'),
      h('p', { class: 'hint' }, 'Send the link and the passphrase through different channels.'),
      h('label', { class: 'check' }, lockToggle, h('span', null, 'Lock room', h('small', null, 'no new join requests'))),
    ) : null,
    h('div', { class: 'panel' }, h('h3', null, 'Members'), memberList),
  );

  root.replaceChildren(
    h('div', { class: 'chat-head' },
      h('div', null, h('h1', null, 'Secure Chat'), badge),
      h('button', { class: 'btn btn-ghost btn-small', onclick: () => { location.hash = '#/chat?'; } }, room.isHost ? 'Close room' : 'Leave'),
    ),
    h('div', { class: 'chat-layout' }, chatPane, side),
  );

  // ---- rendering ----
  const atBottom = () => messages.scrollHeight - messages.scrollTop - messages.clientHeight < 60;
  function push(el) {
    const stick = atBottom();
    messages.append(el);
    if (stick) messages.scrollTop = messages.scrollHeight;
  }
  const system = (text, cls = '') => push(h('li', { class: `sys ${cls}` }, text));

  function bubble(member, ts, ...content) {
    const mine = member.id === room.identity.id;
    const name = h('span', { class: 'who' }, member.nick, member.host ? ' ★' : '');
    name.style.color = colorFor(member.id);
    const time = new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return h('li', { class: `msg ${mine ? 'mine' : ''}` },
      h('div', { class: 'meta' }, mine ? null : name, h('span', { class: 'time' }, time)),
      ...content);
  }

  function textBubble(member, inner) {
    push(bubble(member, inner.ts, h('div', { class: 'body' }, String(inner.body))));
  }

  function fileBubble(key, member, inner) {
    const bar = h('progress', { max: 1, value: 0 });
    const actions = h('div', { class: 'file-actions' });
    const card = h('div', { class: 'file-card' },
      h('span', { class: 'file-icon', 'aria-hidden': 'true' }, '📄'),
      h('div', { class: 'file-info' }, h('strong', null, safeFileName(inner.name)), h('span', { class: 'muted' }, formatBytes(inner.size)), bar),
      actions,
    );
    push(bubble(member, inner.ts, card));
    const entry = { bar, actions };
    fileCards.set(key, entry);
    return entry;
  }

  function renderMembers() {
    memberList.replaceChildren();
    for (const m of room.members.values()) {
      const name = h('span', { class: 'who' }, m.nick);
      name.style.color = colorFor(m.id);
      const tags = [m.host ? h('span', { class: 'tag' }, 'host') : null, m.id === room.identity.id ? h('span', { class: 'tag' }, 'you') : null];
      const code = room.isHost && m.code ? h('div', { class: 'code' }, 'Safety code ', h('strong', { class: 'mono' }, m.code)) : null;
      const kick = room.isHost && !m.host ? h('button', { class: 'btn btn-ghost btn-small', onclick: () => room.kick(m.id) }, 'Remove') : null;
      memberList.append(h('li', null, h('div', { class: 'row tight' }, name, ...tags, kick), code));
    }
    if (!room.isHost && room.hostCode) {
      memberList.append(h('li', { class: 'hint' }, 'Your safety code with the host: ', h('strong', { class: 'mono' }, room.hostCode),
        '. Ask the host to read theirs aloud. It must match.'));
    }
    if (room.isHost && room.members.size === 1) memberList.append(h('li', { class: 'hint' }, 'Nobody has joined yet.'));
  }

  function setEnabled(on) {
    input.disabled = sendBtn.disabled = attachBtn.disabled = !on;
    if (on) input.focus();
  }

  // ---- actions ----
  async function sendText() {
    const body = input.value;
    if (!body.trim()) return;
    try {
      const inner = await room.send({ t: 'text', body });
      textBubble(room.self, inner);
      input.value = '';
      input.style.height = 'auto';
    } catch (e) {
      system(e.message === 'Nobody to send to yet' ? 'Nobody else is in the room yet.' : `Not sent: ${e.message}`, 'error');
    }
  }

  async function sendFiles(list) {
    for (const file of list) {
      if (file.size > MAX_FILE_BYTES) { system(`${file.name} is larger than ${formatBytes(MAX_FILE_BYTES)}.`, 'error'); continue; }
      const placeholder = { name: file.name, size: file.size, ts: Date.now() };
      const card = fileBubble(Symbol('out'), room.self, placeholder);
      try {
        await room.sendFile(file, (p) => { card.bar.value = p; });
        card.bar.value = 1;
        card.actions.append(h('span', { class: 'ok' }, 'Sent ✓'));
      } catch (e) {
        card.actions.append(h('span', { class: 'error' }, e.message === 'Nobody to send to yet' ? 'Nobody to send to' : 'Failed'));
      }
    }
  }

  // ---- room events ----
  room
    .on('message', ({ inner, member }) => { if (inner.t === 'text') textBubble(member, inner); })
    .on('file-progress', ({ key, progress, inner, member }) => {
      (fileCards.get(key) ?? fileBubble(key, member, inner)).bar.value = progress;
    })
    .on('file', ({ key, inner, member, blob }) => {
      const card = fileCards.get(key) ?? fileBubble(key, member, inner);
      fileCards.delete(key);
      const url = URL.createObjectURL(blob);
      objectUrls.push(url);
      card.bar.value = 1;
      card.actions.append(h('a', { class: 'btn btn-small', href: url, download: safeFileName(inner.name) }, 'Download'));
    })
    .on('roster', renderMembers)
    .on('joined', ({ member }) => { system(`${member.nick} joined.`); renderMembers(); })
    .on('left', ({ member, kicked }) => { system(`${member.nick} ${kicked ? 'was removed' : 'left'}.`); renderMembers(); })
    .on('auth-failed', ({ failures }) => system(`Someone tried to join with a wrong passphrase (${failures}).`, 'error'))
    .on('lock', ({ locked, auto }) => {
      lockToggle.checked = locked;
      system(locked ? (auto ? 'Room locked automatically after repeated wrong passphrases.' : 'Room locked. No new join requests.') : 'Room unlocked.');
    })
    .on('request', ({ peerId, nick: who, code }) => {
      const el = h('div', { class: 'request' },
        h('div', null, h('strong', null, who), ' wants to join',
          h('div', { class: 'code' }, 'Safety code ', h('strong', { class: 'mono' }, code ?? '…'),
            ' · ask them to read theirs aloud. It must match.')),
        h('div', { class: 'row tight' },
          h('button', { class: 'btn btn-primary btn-small', onclick: () => { el.remove(); room.accept(peerId); } }, 'Accept'),
          h('button', { class: 'btn btn-small', onclick: () => { el.remove(); room.reject(peerId); system(`Declined ${who}.`); } }, 'Decline'),
        ),
      );
      el.dataset.peer = peerId;
      requests.append(el);
    })
    .on('request-cancelled', ({ peerId }) => requests.querySelector(`[data-peer="${CSS.escape(peerId)}"]`)?.remove())
    .on('connected', ({ code }) => {
      clearTimeout(slowTimer);
      badge.textContent = '✓ Host verified · waiting for approval';
      system(`Connected to the host. Your safety code is ${code}. Waiting for the host to accept you…`);
      renderMembers();
    })
    .on('host-lost', () => {
      setEnabled(false);
      badge.textContent = 'Host disconnected';
      system('The host disconnected. Waiting for them to come back…');
    })
    .on('accepted', () => {
      badge.textContent = '✓ Host verified';
      system('You’re in. Messages are end-to-end encrypted.');
      setEnabled(true);
    })
    .on('denied', ({ reason }) => finish(DENY_REASONS[reason] ?? `Could not join (${reason}).`, true))
    .on('closed', ({ reason }) => { if (reason !== 'left') finish(DENY_REASONS[reason] ?? 'The room was closed.', reason === 'passphrase'); });

  function finish(text, retry) {
    room.leave();
    setEnabled(false);
    badge.textContent = 'Disconnected';
    system(text, 'error');
    if (retry && !room.isHost) {
      push(h('li', { class: 'sys' }, h('button', { class: 'btn btn-small', onclick: onRetry }, 'Try again')));
    }
  }

  renderMembers();
  let slowTimer = null;
  if (restore) {
    system('Room resumed after a reload. Members you approved will reconnect automatically.');
    setEnabled(true);
  } else if (room.isHost) {
    system('Room created. Share the link and the passphrase with the people you want to invite.');
    setEnabled(true);
  } else {
    system('Looking for the host…');
    slowTimer = setTimeout(() => system('Still looking. The host must keep their chat tab open. Check that the link is complete.'), 20000);
  }

  const onBeforeUnload = (e) => { if (room.members.size > 1 || room.isHost) e.preventDefault(); };
  window.addEventListener('beforeunload', onBeforeUnload);

  return {
    leave() {
      clearTimeout(slowTimer);
      window.removeEventListener('beforeunload', onBeforeUnload);
      room.leave();
      if (room.isHost) {
        forgetHost('chat', room.roomId);
        tabStore.del(`uss-pass:${room.roomId}`);
        release?.();
      }
      objectUrls.forEach((u) => URL.revokeObjectURL(u));
    },
  };
}

export function copyRow(label, value, secret) {
  const field = h('input', { type: secret ? 'password' : 'text', readOnly: true, value, class: 'mono', 'aria-label': label });
  const btn = h('button', { class: 'btn btn-small', onclick: () => copyText(value, btn) }, 'Copy');
  return h('div', { class: 'field' }, h('label', null, label), h('div', { class: 'row grow tight' }, field, btn));
}

function colorFor(id) {
  let n = 0;
  for (const c of id) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${n % 360} 65% 45%)`;
}
