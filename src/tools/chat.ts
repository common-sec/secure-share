import { h, formatBytes, safeFileName, clockTime, closesAt, type Child } from '../lib/dom.js';
import { passphraseField, copyRow, field } from './widgets.js';
import { SecureRoom, DENY_REASONS, MAX_TEXT, MAX_FILE_BYTES, DEFAULT_LIFETIME_MS, cleanNick, type Inner, type Member } from '../lib/room.js';
import { saveHost, loadHost, forgetHost, claimHost, sweepHosts, HEARTBEAT_MS, type HostRecord } from '../lib/hoststore.js';

const HOUR = 60 * 60 * 1000;
const LIFETIMES: Array<[ms: number, label: string]> = [[HOUR, '1 hour'], [4 * HOUR, '4 hours'], [8 * HOUR, '8 hours'], [24 * HOUR, '24 hours']];

// Per-tab conveniences (sessionStorage is cleared when the tab closes). Nothing secret goes here:
// the passphrase is kept only in memory, so it isn't shown again after a reload.
const tabStore = {
  get(k: string): string | null { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string): void { try { sessionStorage.setItem(k, v); } catch { /* unavailable */ } },
  del(k: string): void { try { sessionStorage.removeItem(k); } catch { /* unavailable */ } },
};

const LINK_RE = { r: /^[A-Za-z0-9_-]{22}$/, k: /^[A-Za-z0-9_-]{43}$/, h: /^[A-Za-z0-9_-]{43}$/ };

const TRY_ANOTHER = 'Try another network, such as mobile data, or ask your IT team whether browser-to-browser (WebRTC) connections are allowed.';

export interface Invite { roomId: string; secret: string; hostFp: string }
export interface Session { leave(): void }

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** The room link's parameters, if they're well-formed (they come from a URL anyone can craft). */
export function readInvite(params: URLSearchParams): Invite | null {
  const roomId = params.get('r') ?? '';
  const secret = params.get('k') ?? '';
  const hostFp = params.get('h') ?? '';
  return LINK_RE.r.test(roomId) && LINK_RE.k.test(secret) && LINK_RE.h.test(hostFp) ? { roomId, secret, hostFp } : null;
}

export function mount(root: HTMLElement, params: URLSearchParams): () => void {
  let session: Session | null = null;
  let disposed = false;
  const invite = readInvite(params);
  void sweepHosts();
  // Earlier versions kept the host's passphrase here.
  try { for (const k of Object.keys(sessionStorage)) if (k.startsWith('uss-pass:')) tabStore.del(k); } catch { /* unavailable */ }

  const showForm = () => {
    root.replaceChildren();
    const nick = h('input', { type: 'text', maxlength: 32, placeholder: 'e.g. Alice', autocomplete: 'nickname', required: true, value: tabStore.get('uss-nick') ?? '' });
    const pass = passphraseField({ generate: !invite });
    const error = h('p', { class: 'error', hidden: true });
    const submit = h('button', { class: 'btn btn-primary', type: 'submit' }, invite ? 'Join chat' : 'Create chat room');
    const lifetime = h('select', null, ...LIFETIMES.map(([ms, label]) => h('option', { value: String(ms), selected: ms === DEFAULT_LIFETIME_MS }, label)));

    const form = h('form', { class: 'card narrow', onsubmit: async (e: Event) => {
      e.preventDefault();
      const n = cleanNick(nick.value);
      const p = pass.input.value.trim();
      if (!n || !p) { error.textContent = 'Nickname and passphrase are both required.'; error.hidden = false; return; }
      submit.disabled = true;
      submit.textContent = 'Deriving keys…';
      tabStore.set('uss-nick', n);
      try {
        session = await startChat(root, { invite, nick: n, passphrase: p, lifetimeMs: Number(lifetime.value), onRetry: showForm });
      } catch (err) {
        error.textContent = `Could not start: ${errorText(err)}`;
        error.hidden = false;
        submit.disabled = false;
        submit.textContent = invite ? 'Join chat' : 'Create chat room';
      }
    } },
    h('h2', null, invite ? 'You’re invited to a secure chat' : 'Start a secure chat'),
    field('Your nickname', nick),
    field('Room passphrase', pass.el,
      h('p', { class: 'hint' }, invite
        ? 'The host should have given you this separately from the link.'
        : 'Share this with your guests separately from the link, e.g. say it on a call.')),
    invite ? null : h('details', { class: 'advanced' },
      h('summary', null, 'Advanced options'),
      field('Close the room automatically after', lifetime,
        h('p', { class: 'hint' }, 'When the time is up the room closes for everyone and the link stops working. '
          + 'An open room keeps network connections open on this device, so choose the shortest time you need.'))),
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
        h('li', null, '⏱ Rooms close on their own after a time limit (4 hours unless the host chooses otherwise).'),
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
      if (!saved && tabStore.get(`uss-hosted:${invite.roomId}`)) return showEnded();
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

  // This tab hosted the room, but it can't be resumed: the tab was away too long, or time is up.
  function showEnded(): void {
    root.replaceChildren(h('div', { class: 'card narrow' },
      h('h2', null, 'This room has ended'),
      h('p', null, 'A room survives a reload, but not a closed or long-suspended tab, and it closes at its time limit. '
        + 'The link no longer works.'),
      h('div', { class: 'row' }, h('button', { class: 'btn btn-primary', onclick: () => { location.hash = '#/chat?'; } }, 'Start a new chat')),
    ));
  }
  return () => { disposed = true; session?.leave(); };
}

interface StartOptions {
  invite?: Invite | null;
  nick?: string;
  passphrase?: string | null;
  lifetimeMs?: number;
  restore?: HostRecord;
  release?: (() => void) | null;
  onRetry: () => void;
}

interface FileCard { bar: HTMLProgressElement; actions: HTMLElement }

async function startChat(root: HTMLElement, { invite, nick = '', passphrase = null, lifetimeMs, restore, release = null, onRetry }: StartOptions): Promise<Session> {
  let room: SecureRoom;
  if (restore) room = await SecureRoom.host({ app: 'chat', restore, maxGuests: 7 });
  else if (invite) room = await SecureRoom.join({ app: 'chat', ...invite, passphrase: passphrase ?? '', nick });
  else room = await SecureRoom.host({ app: 'chat', passphrase: passphrase ?? '', nick, maxGuests: 7, lifetimeMs });

  const link = room.link('chat');
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const persist = () => { if (!room.closed) void saveHost('chat', room.snapshot()); };
  if (room.isHost) {
    // Keep the room link in the address bar and make a reload resume the room. The saved state is
    // refreshed while the page lives and when it's hidden or unloaded (a reload); once refreshes
    // stop (the tab was closed), it's no longer accepted (see hoststore.ts).
    release ??= await claimHost('chat', room.roomId);
    history.replaceState(null, '', link.slice(link.indexOf('#')));
    persist();
    room.on('persist', persist);
    heartbeat = setInterval(persist, HEARTBEAT_MS);
    window.addEventListener('pagehide', persist);
    document.addEventListener('visibilitychange', persist);
    tabStore.set(`uss-hosted:${room.roomId}`, '1');
  }
  const objectUrls: string[] = [];
  const fileCards = new Map<string | symbol, FileCard>();

  // ---- layout ----
  const badge = h('span', { class: room.isHost ? 'badge badge-host' : 'badge' }, room.isHost ? '★ You are the host' : 'Connecting to host…');
  const requests = h('div', { class: 'requests' });
  const messages = h('ol', { class: 'messages', 'aria-live': 'polite' });
  const input = h('textarea', { rows: 1, placeholder: 'Write a message…', 'aria-label': 'Message', maxlength: MAX_TEXT, disabled: true });
  const sendBtn = h('button', { class: 'btn btn-primary', disabled: true, onclick: sendText, title: 'Send (Enter)' }, 'Send');
  const fileInput = h('input', {
    type: 'file', multiple: true, hidden: true,
    onchange: (e: Event) => { const t = e.target as HTMLInputElement; void sendFiles(t.files); t.value = ''; },
  });
  const attachBtn = h('button', { class: 'btn btn-ghost attach', disabled: true, title: `Attach files (up to ${formatBytes(MAX_FILE_BYTES)})`, onclick: () => fileInput.click() }, '📎');
  const memberList = h('ul', { class: 'members' });
  const expiryNote = h('p', { class: 'hint warn', hidden: !room.expiresAt },
    room.expiresAt ? `⏱ The room closes automatically at ${clockTime(room.expiresAt)}.` : '');
  const lockToggle = h('input', { type: 'checkbox', onchange: (e: Event) => room.setLocked((e.target as HTMLInputElement).checked) });

  const chatPane = h('section', { class: 'chat-main' },
    requests,
    messages,
    h('div', { class: 'composer' }, attachBtn, fileInput, input, sendBtn),
  );
  chatPane.addEventListener('dragover', (e) => { if (!input.disabled) { e.preventDefault(); chatPane.classList.add('over'); } });
  chatPane.addEventListener('dragleave', (e) => { if (e.target === chatPane) chatPane.classList.remove('over'); });
  chatPane.addEventListener('drop', (e) => { e.preventDefault(); chatPane.classList.remove('over'); if (!input.disabled) void sendFiles(e.dataTransfer?.files); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendText(); } });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 200)}px`; });

  const side = h('aside', { class: 'chat-side' },
    room.isHost ? h('div', { class: 'panel' },
      h('h3', null, 'Invite'),
      copyRow('Link', link, true),
      passphrase
        ? copyRow('Passphrase', passphrase, true)
        : h('p', { class: 'hint' }, 'Passphrase: the one you chose when creating the room (not kept after a reload, for safety).'),
      h('p', { class: 'hint' }, 'Send the link and the passphrase through different channels.'),
      expiryNote,
      h('label', { class: 'check' }, lockToggle, h('span', null, 'Lock room', h('small', null, 'no new join requests'))),
    ) : null,
    h('div', { class: 'panel' }, h('h3', null, 'Members'), memberList, room.isHost ? null : expiryNote),
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
  function push(el: HTMLElement): void {
    const stick = atBottom();
    messages.append(el);
    if (stick) messages.scrollTop = messages.scrollHeight;
  }
  const system = (text: string, cls = '') => push(h('li', { class: `sys ${cls}` }, text));

  function bubble(member: Member, ts: number, ...content: Child[]): HTMLElement {
    const mine = member.id === room.identity.id;
    const name = h('span', { class: 'who' }, member.nick, member.host ? ' ★' : '');
    name.style.color = colorFor(member.id);
    const time = clockTime(ts);
    return h('li', { class: `msg ${mine ? 'mine' : ''}` },
      h('div', { class: 'meta' }, mine ? null : name, h('span', { class: 'time' }, time)),
      ...content);
  }

  function textBubble(member: Member, inner: Inner): void {
    push(bubble(member, inner.ts, h('div', { class: 'body' }, String(inner.body))));
  }

  function fileBubble(key: string | symbol, member: Member, inner: { name: unknown; size: number; ts: number }): FileCard {
    const bar = h('progress', { max: 1, value: 0 });
    const actions = h('div', { class: 'file-actions' });
    const card = h('div', { class: 'file-card' },
      h('span', { class: 'file-icon', 'aria-hidden': 'true' }, '📄'),
      h('div', { class: 'file-info' }, h('strong', null, safeFileName(inner.name)), h('span', { class: 'muted' }, formatBytes(inner.size)), bar),
      actions,
    );
    push(bubble(member, inner.ts, card));
    const entry: FileCard = { bar, actions };
    fileCards.set(key, entry);
    return entry;
  }

  function renderMembers(): void {
    memberList.replaceChildren();
    for (const m of room.members.values()) {
      const name = h('span', { class: 'who' }, m.nick);
      name.style.color = colorFor(m.id);
      const tags = [m.host ? h('span', { class: 'tag' }, 'host') : null, m.id === room.identity.id ? h('span', { class: 'tag' }, 'you') : null];
      const code = room.isHost && m.code ? h('div', { class: 'code' }, 'Safety code ', h('strong', { class: 'mono' }, m.code)) : null;
      const kick = room.isHost && !m.host ? h('button', { class: 'btn btn-ghost btn-small', onclick: () => { void room.kick(m.id); } }, 'Remove') : null;
      memberList.append(h('li', null, h('div', { class: 'row tight' }, name, ...tags, kick), code));
    }
    if (!room.isHost && room.hostCode) {
      memberList.append(h('li', { class: 'hint' }, 'Your safety code with the host: ', h('strong', { class: 'mono' }, room.hostCode),
        '. Ask the host to read theirs aloud. It must match.'));
    }
    if (room.isHost && room.members.size === 1) memberList.append(h('li', { class: 'hint' }, 'Nobody has joined yet.'));
  }

  function setEnabled(on: boolean): void {
    input.disabled = sendBtn.disabled = attachBtn.disabled = !on;
    if (on) input.focus();
  }

  // ---- actions ----
  async function sendText(): Promise<void> {
    const body = input.value;
    if (!body.trim()) return;
    try {
      const inner = await room.send({ t: 'text', body });
      textBubble(room.self, inner);
      input.value = '';
      input.style.height = 'auto';
    } catch (e) {
      const msg = errorText(e);
      system(msg === 'Nobody to send to yet' ? 'Nobody else is in the room yet.' : `Not sent: ${msg}`, 'error');
    }
  }

  async function sendFiles(list: FileList | null | undefined): Promise<void> {
    for (const file of Array.from(list ?? [])) {
      if (file.size > MAX_FILE_BYTES) { system(`${file.name} is larger than ${formatBytes(MAX_FILE_BYTES)}.`, 'error'); continue; }
      const placeholder = { name: file.name, size: file.size, ts: Date.now() };
      const card = fileBubble(Symbol('out'), room.self, placeholder);
      try {
        await room.sendFile(file, (p) => { card.bar.value = p; });
        card.bar.value = 1;
        card.actions.append(h('span', { class: 'ok' }, 'Sent ✓'));
      } catch (e) {
        card.actions.append(h('span', { class: 'error' }, errorText(e) === 'Nobody to send to yet' ? 'Nobody to send to' : 'Failed'));
      }
    }
  }

  // ---- room events ----
  // Network problems already explained, so a flaky network doesn't flood the chat.
  const netWarned = new Set<'direct' | 'relays'>();
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
    .on('joined', ({ member }) => { netWarned.delete('direct'); system(`${member.nick} joined.`); renderMembers(); })
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
          h('button', { class: 'btn btn-primary btn-small', onclick: () => { el.remove(); void room.accept(peerId); } }, 'Accept'),
          h('button', { class: 'btn btn-small', onclick: () => { el.remove(); void room.reject(peerId); system(`Declined ${who}.`); } }, 'Decline'),
        ),
      );
      el.dataset.peer = peerId;
      requests.append(el);
    })
    .on('request-cancelled', ({ peerId }) => { requests.querySelector(`[data-peer="${CSS.escape(peerId)}"]`)?.remove(); })
    .on('direct-blocked', () => {
      if (netWarned.has('direct')) return;
      netWarned.add('direct');
      system(room.isHost
        ? 'Someone with the link tried to join, but couldn’t connect directly: a firewall or a strict network on their side or yours is probably blocking it. They can try another network, such as mobile data.'
        : `Found the room, but couldn’t connect directly to the host: a firewall or a strict network on your side or theirs is probably blocking it. ${TRY_ANOTHER}`, 'error');
    })
    .on('relays', ({ reachable }) => {
      if (reachable) { if (netWarned.delete('relays')) system('Reconnected to the discovery relays.'); return; }
      netWarned.add('relays');
      system(`Can’t reach the discovery relays, so ${room.isHost ? 'nobody can find this room' : 'the host can’t be found'}. `
        + `This network may block them (secure WebSockets on port 443), or you may be offline. ${TRY_ANOTHER}`, 'error');
    })
    .on('connected', ({ code }) => {
      netWarned.clear();
      clearTimeout(slowTimer);
      badge.textContent = '✓ Host verified · waiting for approval';
      system(`Connected to the host. Your safety code is ${code}. Waiting for the host to accept you…`);
      renderMembers();
    })
    .on('discovery', ({ on }) => {
      if (room.isHost && !room.closed) {
        system(on
          ? 'Open for new join requests (connected to discovery relays).'
          : 'Closed to new join requests: disconnected from the discovery relays. Unlock the room to invite more people.');
      }
    })
    .on('host-lost', () => {
      setEnabled(false);
      badge.textContent = 'Host disconnected';
      system('The host disconnected. Waiting for them to come back…');
    })
    .on('accepted', () => {
      badge.textContent = '✓ Host verified';
      system('You’re in. Messages are end-to-end encrypted.');
      if (room.expiresAt && expiryNote.hidden) {
        expiryNote.textContent = `⏱ The room closes automatically at ${clockTime(room.expiresAt)}.`;
        expiryNote.hidden = false;
        system(`This room closes automatically at ${closesAt(room.expiresAt)}.`);
      }
      setEnabled(true);
    })
    .on('expiring', ({ expiresAt }) => system(`The room closes at ${closesAt(expiresAt)}. Save anything you need.`))
    .on('denied', ({ reason }) => finish((DENY_REASONS as Record<string, string>)[reason] ?? `Could not join (${reason}).`, true))
    .on('closed', ({ reason }) => { if (reason !== 'left') finish(DENY_REASONS[reason], reason === 'passphrase'); });

  function finish(text: string, retry: boolean): void {
    void room.leave();
    if (room.isHost) stopPersisting();
    setEnabled(false);
    badge.textContent = 'Disconnected';
    system(text, 'error');
    if (retry && !room.isHost) {
      push(h('li', { class: 'sys' }, h('button', { class: 'btn btn-small', onclick: onRetry }, 'Try again')));
    }
  }

  renderMembers();
  let slowTimer: ReturnType<typeof setTimeout> | undefined;
  if (restore) {
    system('Room resumed after a reload. Members you approved will reconnect automatically.');
    setEnabled(true);
  } else if (room.isHost) {
    system('Room created. Share the link and the passphrase with the people you want to invite.');
    if (room.expiresAt) system(`It closes automatically at ${closesAt(room.expiresAt)}, for everyone.`);
    setEnabled(true);
  } else {
    system('Looking for the host…');
    slowTimer = setTimeout(() => system('Still looking. The host must keep their chat tab open. Check that the link is complete.'), 20000);
  }

  const onBeforeUnload = (e: BeforeUnloadEvent) => { if (!room.closed && (room.members.size > 1 || room.isHost)) e.preventDefault(); };
  window.addEventListener('beforeunload', onBeforeUnload);

  function stopPersisting(): void {
    clearInterval(heartbeat);
    window.removeEventListener('pagehide', persist);
    document.removeEventListener('visibilitychange', persist);
    void forgetHost('chat', room.roomId);
  }

  return {
    leave() {
      clearTimeout(slowTimer);
      window.removeEventListener('beforeunload', onBeforeUnload);
      void room.leave();
      if (room.isHost) {
        stopPersisting();
        tabStore.del(`uss-hosted:${room.roomId}`);
        release?.();
      }
      objectUrls.forEach((u) => URL.revokeObjectURL(u));
    },
  };
}

function colorFor(id: string): string {
  let n = 0;
  for (const c of id) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${n % 360} 65% 45%)`;
}
