import { h, copyText, formatBytes, safeFileName, closesAt } from '../lib/dom.js';
import { SecureRoom, DENY_REASONS, MAX_TEXT, MAX_FILE_BYTES } from '../lib/room.js';
import { readInvite, type Invite, type Session } from './chat.js';
import { passphraseField, copyRow, field } from './widgets.js';
import { roomPassphrase } from '../lib/passphrase.js';
import { qrSvg } from '../vendor/qrcode.js';
import { APP_NAME, REPOSITORY } from '../lib/app.js';

type SetSession = (s: Session) => void;
const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function mount(root: HTMLElement, params: URLSearchParams): () => void {
  let session: Session | null = null;
  const invite = readInvite(params);
  if (invite) {
    history.replaceState(null, '', '#/share');
    document.title = `You’ve received a secure delivery · ${APP_NAME}`;
  }

  const intro = h('div', null,
    h('p', { class: 'lead' },
      invite
        ? 'It comes straight from their browser to yours, can be opened only once, and isn’t stored anywhere. '
        : 'Send a password or a file privately. It goes straight to the other person and works only once. ',
      // A button, not a link: the hash holds the route, so an in-page anchor would navigate away.
      h('button', { type: 'button', class: 'link-button', onclick: () => openHowItWorks(root) }, 'How it works ›')),
  );
  root.append(h('section', { class: 'page-head' }, h('h1', null, invite ? 'Someone sent you something privately' : 'Secure Share'), intro));
  const body = h('div');
  root.append(body);

  if (invite) receiveForm(body, invite, (s) => { session = s; });
  // Once the link exists, the waiting screen shows only the steps and the status.
  else sendForm(body, (s) => { session = s; intro.hidden = true; });

  return () => session?.leave();
}

// ---------------------------------------------------------------- sender
/** The "How it works" box under the page: for the sender, or for someone who received a link. */
function howItWorks(recipient: boolean): HTMLElement {
  return h('details', { class: 'card narrow guide how-it-works' },
    h('summary', null, h('h2', null, 'How it works')),
    recipient
      ? [
        h('p', null, 'Someone used ', APP_NAME, ' to send you something privately: a password, a note or a file. It’s encrypted end to end and comes straight from their browser to yours. Nothing is uploaded or stored anywhere, and no account is needed.'),
        h('p', null, 'The link alone isn’t enough: you also need the words they tell you, typed exactly as they say them. Once you’ve received it, the link stops working.'),
        h('p', null, 'This app is open source: you can ', h('a', { href: REPOSITORY, rel: 'noopener' }, 'read its code'), '.'),
      ]
      : [
        h('p', null, 'The delivery is encrypted end to end and goes straight from your browser to the recipient’s, from computer to computer or phone. No special software is needed, and nothing is uploaded or stored anywhere.'),
        h('p', null, 'The recipient needs the link ', h('em', null, 'and'), ' the words. On a call, paste the link in the chat and say the words aloud: they’re never written anywhere. If the calling app itself is the concern, send the link another way.'),
        h('p', null, 'Keep this page open until the delivery completes: it comes from your browser, so closing the page cancels it. The link works once, and stops working after a time limit if nobody uses it.'),
        h('h3', null, 'Which one should I use?'),
        h('ul', null,
          h('li', null, h('strong', null, 'Secure Share'), ' (this page): send something ', h('em', null, 'once'),
            ' to ', h('em', null, 'one'), ' person: a password, a key, a document. The link stops working after delivery.'),
          h('li', null, h('strong', null, h('a', { href: '#/chat' }, 'Secure Chat')), ': several things to exchange, replies, or more than two people. You host a private room and approve everyone who joins.'),
        ),
      ],
  );
}

/** Opens the "How it works" box under the form and scrolls to it. */
function openHowItWorks(root: HTMLElement): void {
  const how = root.querySelector<HTMLDetailsElement>('details.how-it-works');
  if (!how) return;
  how.open = true;
  how.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** What's copied for the recipient: an invitation with the link, never the passphrase. */
const INVITATION = `I’m sending you something privately with ${APP_NAME}. Open this link, and I’ll tell you the words:`;
export const invitation = (link: string): string => `${INVITATION} ${link}`;

const EMAIL_SUBJECT = `Something for you, sent privately with ${APP_NAME}`;

/**
 * "Send with" links: email (the default mail app, Gmail and Outlook on the web) and the messengers
 * that have an official share link (Slack and Google Chat don't: Copy and the system share sheet
 * cover them). Plain links: nothing is loaded from these sites until the sender clicks, and then
 * the invitation with the link goes there, never the words.
 */
export function messengerLinks(link: string): [name: string, href: string][] {
  const e = encodeURIComponent;
  const body = e(invitation(link));
  return [
    ['Email', `mailto:?subject=${e(EMAIL_SUBJECT)}&body=${body}`],
    ['Gmail', `https://mail.google.com/mail/?view=cm&fs=1&su=${e(EMAIL_SUBJECT)}&body=${body}`],
    ['Outlook', `https://outlook.office.com/mail/deeplink/compose?subject=${e(EMAIL_SUBJECT)}&body=${body}`],
    ['WhatsApp', `https://wa.me/?text=${body}`],
    ['Telegram', `https://t.me/share/url?url=${e(link)}&text=${e(INVITATION)}`],
    ['Teams', `https://teams.microsoft.com/share?href=${e(link)}&msgText=${e(INVITATION)}&preview=false`],
  ];
}

/**
 * Copies text that isn't known yet. Browsers only allow copying shortly after a click, and the
 * link takes a moment to create (key derivation), so the write starts inside the click with a
 * ClipboardItem whose content resolves later (Chrome, Safari, recent Firefox); writeText once the
 * text exists is the fallback. Resolves to whether the copy worked.
 */
function copyWhenReady(text: Promise<string>): Promise<boolean> {
  const fallback = (): Promise<boolean> => text.then((t) => navigator.clipboard.writeText(t)).then(() => true, () => false);
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      const item = new ClipboardItem({ 'text/plain': text.then((t) => new Blob([t], { type: 'text/plain' })) });
      return navigator.clipboard.write([item]).then(() => true, fallback);
    }
  } catch { /* unsupported: fall back */ }
  return fallback();
}

/** The "Send with" buttons. Web pages open in a new tab; mailto: opens the mail app. */
function sendWith(link: string): HTMLElement {
  return h('div', { class: 'row tight share-to' }, h('span', { class: 'hint inline' }, 'Send with'),
    ...messengerLinks(link).map(([name, href]) => h('a', {
      class: 'btn btn-small', href, rel: 'noopener noreferrer', target: href.startsWith('https:') ? '_blank' : null,
    }, name)));
}

// One question and one button: the passphrase is generated when the link is created and shown on
// the next screen, where it's used. Choosing your own words and checking who's receiving are under
// More options; keeping the screen on is offered on the waiting screen.
function sendForm(body: HTMLElement, setSession: SetSession): void {
  const files: File[] = [];
  const text = h('textarea', { rows: 5, maxlength: MAX_TEXT, placeholder: 'Paste a password, a note, a key…' });
  const fileList = h('ul', { class: 'file-list' });
  const fileInput = h('input', {
    type: 'file', multiple: true, hidden: true,
    onchange: (e: Event) => { const t = e.target as HTMLInputElement; addFiles(t.files); t.value = ''; },
  });
  const addButton = h('button', { type: 'button', class: 'btn btn-tap', onclick: () => fileInput.click() }, '+ Add files');
  const pass = passphraseField({ generate: true, enough: 'Strong enough for this one-time link ✓' });
  pass.input.required = false; // inside the closed More options; empty means generated words
  const approve = h('input', { type: 'checkbox' });
  const error = h('p', { class: 'error', hidden: true });

  function addFiles(list: FileList | null | undefined): void {
    for (const f of Array.from(list ?? [])) {
      if (f.size > MAX_FILE_BYTES) { showError(`${f.name} is larger than ${formatBytes(MAX_FILE_BYTES)}.`); continue; }
      files.push(f);
    }
    renderFiles();
  }
  function renderFiles(): void {
    fileList.replaceChildren(...files.map((f, i) => h('li', null,
      h('span', null, '📄 ', f.name), h('span', { class: 'muted' }, formatBytes(f.size)),
      h('button', { type: 'button', class: 'btn btn-ghost btn-small', 'aria-label': `Remove ${f.name}`, onclick: () => { files.splice(i, 1); renderFiles(); } }, '✕'))));
  }
  const showError = (msg: string): void => { error.textContent = msg; error.hidden = false; };

  const submit = h('button', { class: 'btn btn-primary btn-tap', type: 'submit' }, 'Create link');
  const form = h('form', { class: 'card narrow', onsubmit: async (e: Event) => {
    e.preventDefault();
    error.hidden = true;
    // The words in More options: generated unless the sender chose their own.
    const passphrase = pass.input.value.trim() || roomPassphrase();
    if (!text.value.trim() && files.length === 0) return showError('Add some text or at least one file.');
    let linkReady!: (link: string) => void;
    let linkFailed!: (err: unknown) => void;
    const link = new Promise<string>((resolve, reject) => { linkReady = resolve; linkFailed = reject; });
    const copied = copyWhenReady(link.then(invitation));
    submit.disabled = true;
    submit.textContent = 'Creating the link…';
    try {
      const room = await SecureRoom.host({ app: 'share', passphrase, nick: 'Sender', maxGuests: 1, autoAccept: !approve.checked });
      linkReady(room.link('share'));
      setSession(senderView(body, room, { text: text.value, files, passphrase, copied }));
    } catch (err) {
      linkFailed(err);
      showError(`Could not start: ${errorText(err)}`);
      submit.disabled = false;
      submit.textContent = 'Create link';
    }
  } },
  field('What do you want to send?', text),
  h('div', { class: 'row' }, addButton, fileInput, h('span', { class: 'hint inline' }, 'or drop them here')),
  fileList,
  error,
  h('div', { class: 'row' }, submit),
  h('details', { class: 'advanced' },
    h('summary', null, 'More options'),
    field('Choose my own words', pass.el,
      h('p', { class: 'hint' }, 'The recipient needs these words as well as the link. Tell them, or send them another way.')),
    h('label', { class: 'check' }, approve, h('span', null, 'Let me check who’s receiving before sending',
      h('small', null, 'you compare a short code with them, e.g. by phone, then click Deliver'))),
  ),
  );
  // Files can be dropped anywhere on the card.
  form.addEventListener('dragover', (e) => { e.preventDefault(); form.classList.add('over'); });
  form.addEventListener('dragleave', (e) => { if (!form.contains(e.relatedTarget as Node | null)) form.classList.remove('over'); });
  form.addEventListener('drop', (e) => { e.preventDefault(); form.classList.remove('over'); addFiles(e.dataTransfer?.files); });

  body.append(form,
    h('p', { class: 'narrow hint chat-pointer' }, 'Several things to exchange, or a conversation? ', h('a', { href: '#/chat' }, 'Use Secure Chat ›')),
    howItWorks(false),
  );
}

/**
 * The passphrase shown large enough to read aloud, word by word, masked by default with Show
 * (people share their screen on calls). The mask shows one dot group per word, never the letters.
 */
function wordsView(passphrase: string): HTMLElement {
  const parts = passphrase.split(' ').filter(Boolean);
  const shown = h('span', { class: 'words-text', hidden: true }, ...parts.map((w) => h('span', { class: 'word' }, w)));
  const masked = h('span', { class: 'words-text', 'aria-label': 'Hidden words' }, ...parts.map(() => h('span', { class: 'word' }, '••••')));
  const toggle = h('button', { type: 'button', class: 'btn btn-ghost btn-small', 'aria-pressed': 'false', onclick: () => {
    const show = shown.hidden;
    shown.hidden = !show;
    masked.hidden = show;
    toggle.textContent = show ? 'Hide' : 'Show';
    toggle.setAttribute('aria-pressed', String(show));
  } }, 'Show');
  const copy = h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: () => copyText(passphrase, copy) }, 'Copy');
  return h('div', { class: 'words mono' }, masked, shown, toggle, copy);
}

interface Outgoing { text: string; files: File[]; passphrase: string; copied: Promise<boolean> }

function senderView(body: HTMLElement, room: SecureRoom, { text, files, passphrase, copied }: Outgoing): Session {
  const link = room.link('share');
  const invite = invitation(link);
  const copyNote = h('span', { class: 'copy-note', 'aria-live': 'polite' }, 'Copying the invitation…');
  void copied.then((ok) => {
    copyNote.textContent = ok ? 'Link copied ✓ Paste it in your chat with them.' : 'Copy the link and paste it in your chat with them.';
    if (ok && current === 0) step(1);
  });
  const copyInvite = h('button', { type: 'button', class: 'btn btn-small', onclick: () => copyText(invite, copyInvite) }, 'Copy again');
  const shareButton = 'share' in navigator
    ? h('button', { type: 'button', class: 'btn btn-small', onclick: () => { navigator.share({ text: invite }).catch(() => {}); } }, 'Share…')
    : null;
  // For a recipient in the same room: scan the link from this screen. Drawn on first use.
  const qrBox = h('div', { class: 'qr-box', hidden: true });
  const qrButton = h('button', { type: 'button', class: 'btn btn-small', 'aria-expanded': 'false', onclick: async () => {
    if (!qrBox.firstChild) {
      try {
        qrBox.append(await qrSvg(link, 'QR code of the one-time link'), h('p', { class: 'hint' }, 'Scan it with the recipient’s phone camera. It holds the link only, not the words.'));
      } catch {
        qrBox.append(h('p', { class: 'error' }, 'The QR code could not be drawn. Copy the link instead.'));
      }
    }
    qrBox.hidden = !qrBox.hidden;
    qrButton.setAttribute('aria-expanded', String(!qrBox.hidden));
  } }, 'QR code');
  const status = h('p', { class: 'status-big', role: 'status' });
  const extra = h('div', { 'aria-live': 'polite' });
  const request = h('div', { 'aria-live': 'polite' });
  const away = h('p', { class: 'hint warn', hidden: true },
    'You left this page. Keep it open and in front until the delivery completes: phones may pause or close pages in the background.');
  // Off by default: an unlocked device left alone exposes this page and everything else on it.
  let keepScreenOn = false;
  const awakeNote = h('p', { class: 'hint warn', hidden: true },
    '⚠ This device will stay awake and unlocked until the delivery completes, as long as this tab is open and in front. Don’t leave your phone or computer unattended while it’s on.');
  const awake = h('input', { type: 'checkbox', onchange: () => {
    keepScreenOn = awake.checked;
    awakeNote.hidden = !keepScreenOn;
    if (keepScreenOn) void keepAwake();
    else { void wakeLock?.release().catch(() => {}); wakeLock = null; }
  } });
  // Only where the browser can do it (Screen Wake Lock).
  const awakeOption = 'wakeLock' in navigator
    ? h('label', { class: 'check' }, awake, h('span', null, 'Keep my screen on',
      h('small', null, 'stops the screen from turning off or locking until the delivery completes')))
    : null;
  const cancel = h('button', { class: 'btn btn-ghost', onclick: () => { location.hash = '#/share?'; } }, 'Cancel');
  let delivered = false;

  // The share lives in this tab: if the sender opted in, keep the screen on while waiting (the lock
  // is dropped whenever the tab is hidden, so it's taken again on return), and use the tab title to
  // warn while it's in the background and to signal delivery.
  const waitingTitle = document.title;
  let wakeLock: WakeLockSentinel | null = null;
  let stopped = false;
  const keepAwake = async () => {
    if (!keepScreenOn || stopped || wakeLock || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (stopped) void lock.release();
      else { wakeLock = lock; lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; }); }
    } catch { /* refused, e.g. battery saver: the warnings below still apply */ }
  };
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      document.title = `⚠ Keep this tab open · ${APP_NAME}`;
    } else {
      document.title = waitingTitle;
      away.hidden = false;
      void keepAwake();
    }
  };
  const stopWaiting = () => {
    stopped = true;
    document.removeEventListener('visibilitychange', onVisibility);
    void wakeLock?.release().catch(() => {});
    wakeLock = null;
    away.hidden = true;
    awakeNote.hidden = true;
    if (awakeOption) awakeOption.hidden = true;
  };
  document.addEventListener('visibilitychange', onVisibility);
  void keepAwake();

  // The screen is the instructions, in the order they happen; each step ticks when it's done:
  // 1 when the link is copied, 2 when the recipient connects, 3 when it's delivered.
  const words = wordsView(passphrase);
  const steps = h('ol', { class: 'guide-steps' },
    h('li', null,
      h('div', { class: 'step-title' }, copyNote),
      h('div', { class: 'row tight' }, copyInvite, shareButton, qrButton),
      sendWith(link),
      qrBox,
      h('details', { class: 'advanced' }, h('summary', null, 'Show the link'),
        copyRow('One-time link', link, true, 'Copy link only'))),
    h('li', null,
      h('div', { class: 'step-title' }, 'Tell them these words:'),
      words,
      h('p', { class: 'hint' }, 'Not on a call? Send the words another way than the link, e.g. a text message.'),
      request),
    h('li', null,
      h('div', { class: 'step-title' }, 'Keep this page open until they’ve got it.'),
      awakeOption, awakeNote, status, extra));
  let current = 0;
  const step = (n: number) => {
    current = n;
    [...steps.children].forEach((li, i) => {
      li.classList.toggle('done', i < n);
      li.classList.toggle('active', i === n);
    });
  };
  step(0);
  const setStatus = (t: string) => { status.textContent = t; };

  body.replaceChildren(h('div', { class: 'card narrow' },
    steps,
    room.expiresAt ? h('p', { class: 'hint' }, `⏱ If nobody receives it, the link stops working at ${closesAt(room.expiresAt)}.`) : null,
    away,
    h('div', { class: 'row' }, cancel),
  ));
  setStatus('Waiting for the recipient to open the link…');

  room
    .on('auth-failed', ({ failures }) => extra.append(h('p', { class: 'error' }, `Someone entered a wrong passphrase (${failures}).`)))
    .on('lock', ({ auto }) => { if (auto) setStatus('Locked after repeated wrong passphrases. Cancel and create a new link.'); })
    .on('request', ({ peerId, code }) => {
      setStatus('Someone with the right words wants to receive it.');
      request.replaceChildren(h('div', { class: 'request' },
        h('div', null, 'Read your code to them: ', h('strong', { class: 'mono' }, code ?? '…'), '. Does it match theirs?'),
        h('div', { class: 'row tight' },
          h('button', { class: 'btn btn-primary btn-small', onclick: () => { request.replaceChildren(); void room.accept(peerId); } }, 'Deliver'),
          h('button', { class: 'btn btn-small', onclick: () => { request.replaceChildren(); void room.reject(peerId); setStatus('Declined. Still waiting…'); } }, 'Decline')),
      ));
    })
    .on('joined', ({ member }) => {
      step(2);
      room.setLocked(true);
      setStatus(`Recipient connected (safety code ${member.code ?? '…'}). Sending…`);
      void (async () => {
        try {
          await room.send({ t: 'manifest', text, files: files.map((f) => ({ name: f.name, size: f.size })) });
          for (const [i, f] of files.entries()) {
            await room.sendFile(f, (p) => setStatus(`Sending ${f.name} (${i + 1}/${files.length}): ${Math.round(p * 100)}%`));
          }
          setStatus('Waiting for the recipient to confirm…');
        } catch (e) {
          setStatus(`Delivery failed: ${errorText(e)}`);
        }
      })();
    })
    .on('message', ({ inner }) => {
      if (inner.t !== 'ack') return;
      delivered = true;
      stopWaiting();
      document.title = `✓ Delivered · ${APP_NAME}`;
      step(3);
      setStatus('Delivered ✓ The room is closed and the link no longer works.');
      cancel.textContent = 'Share something else';
      void room.leave();
    })
    .on('expiring', ({ expiresAt }) => { if (!delivered) extra.append(h('p', { class: 'hint warn' }, `⏱ The link stops working at ${closesAt(expiresAt)}.`)); })
    .on('closed', ({ reason }) => {
      if (delivered || reason !== 'expired') return;
      stopWaiting();
      document.title = waitingTitle;
      setStatus('Not delivered: the link reached its time limit and no longer works. Create a new one to try again.');
      cancel.textContent = 'Share something else';
    })
    .on('left', () => {
      if (delivered) return;
      step(1);
      room.setLocked(false);
      setStatus('The recipient disconnected before finishing. Waiting for them to reconnect…');
    });

  return { leave: () => { stopWaiting(); void room.leave(); } };
}

// ---------------------------------------------------------------- recipient
function receiveForm(body: HTMLElement, invite: Invite, setSession: SetSession): void {
  const pass = passphraseField({ generate: false });
  pass.input.placeholder = 'e.g. six words';
  const error = h('p', { class: 'error', hidden: true });
  const submit = h('button', { class: 'btn btn-primary btn-tap', type: 'submit' }, 'Open');
  body.replaceChildren(h('form', { class: 'card narrow', onsubmit: async (e: Event) => {
    e.preventDefault();
    const passphrase = pass.input.value.trim();
    if (!passphrase) { error.textContent = 'Type the words they tell you.'; error.hidden = false; return; }
    submit.disabled = true;
    submit.textContent = 'Opening…';
    try {
      const room = await SecureRoom.join({ app: 'share', ...invite, passphrase, nick: 'Recipient' });
      setSession(receiverView(body, room, () => receiveForm(body, invite, setSession)));
    } catch (err) {
      error.textContent = `Could not start: ${errorText(err)}`;
      error.hidden = false;
      submit.disabled = false;
      submit.textContent = 'Open';
    }
  } },
  h('ol', { class: 'guide-steps' },
    h('li', { class: 'active' },
      field('Type the words they tell you', pass.el,
        h('p', { class: 'hint' }, 'Usually six words, exactly as they say them. Not on a call? They should have sent them separately from the link.')),
      error,
      h('div', { class: 'row' }, submit)),
    h('li', null, h('div', { class: 'step-title' }, 'Connect to the sender')),
    h('li', null, h('div', { class: 'step-title' }, 'See what they sent'))),
  ), howItWorks(true));
  pass.input.focus();
}

/** What the sender announces before the files; it comes from the peer, so it's validated. */
interface Manifest { text: string; fileCount: number }

function parseManifest(fields: Record<string, unknown>): Manifest {
  return {
    text: typeof fields.text === 'string' ? fields.text : '',
    fileCount: Array.isArray(fields.files) ? fields.files.length : 0,
  };
}

/** The received text: masked until the recipient asks to see it, and removable from the page. */
function receivedText(text: string): HTMLElement {
  const secret = h('pre', { class: 'secret', hidden: true }, text);
  const masked = h('div', { class: 'secret masked' },
    h('span', { 'aria-hidden': 'true' }, '••••••••••••'), h('span', { class: 'sr-only' }, 'Hidden'));
  const show = h('button', { type: 'button', class: 'btn btn-small', 'aria-pressed': 'false' }, 'Show');
  show.addEventListener('click', () => {
    const reveal = secret.hidden;
    secret.hidden = !reveal;
    masked.hidden = reveal;
    show.textContent = reveal ? 'Hide' : 'Show';
    show.setAttribute('aria-pressed', String(reveal));
  });
  const copy = h('button', { type: 'button', class: 'btn btn-small', onclick: () => copyText(text, copy) }, 'Copy');
  const clear = h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: () =>
    box.replaceChildren(h('p', { class: 'hint' }, 'The text was cleared from the screen.')) }, 'Clear from screen');
  const box = h('div', { class: 'field' },
    h('div', { class: 'row spread' }, h('span', { class: 'label' }, 'Text'), h('div', { class: 'row tight' }, show, copy, clear)),
    masked, secret);
  return box;
}

function receiverView(body: HTMLElement, room: SecureRoom, retry: () => void): Session {
  const status = h('p', { class: 'status-big', role: 'status' }, 'Looking for the sender…');
  const result = h('div', { class: 'result' });
  const objectUrls: string[] = [];
  let manifest: Manifest | null = null;
  let received = 0;
  let done = false;
  const progress = h('progress', { max: 1, value: 0, hidden: true });
  const code = h('p', { class: 'hint', hidden: true });
  const finish = h('div', { hidden: true },
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn btn-primary btn-tap', onclick: () => clearAll() }, 'Done'),
      h('span', { class: 'hint inline' }, 'clears it from this page.')),
    h('p', { class: 'hint' }, h('a', { href: '#/share?' }, 'Send something back ›')));

  // Words → connecting (finding the sender, connected, receiving %) → what they sent → Done.
  const steps = h('ol', { class: 'guide-steps' },
    h('li', { class: 'done' }, h('div', { class: 'step-title' }, 'Words typed')),
    h('li', { class: 'active' }, h('div', { class: 'step-title' }, 'Connecting to the sender'), status, progress, code),
    h('li', null, h('div', { class: 'step-title' }, 'Here’s what they sent'), result, finish));
  const step = (n: number) => [...steps.children].forEach((li, i) => {
    li.classList.toggle('done', i < n);
    li.classList.toggle('active', i === n);
  });
  body.replaceChildren(h('div', { class: 'card narrow' }, steps), howItWorks(true));
  const slow = setTimeout(() => {
    if (!done) status.textContent = 'Still looking for the sender. Ask them to keep their page open. If someone already opened this link, it no longer works.';
  }, 20000);

  /** Done: nothing from the delivery stays on the page, and the room is left. */
  function clearAll(): void {
    void room.leave();
    objectUrls.forEach((u) => URL.revokeObjectURL(u));
    objectUrls.length = 0;
    body.replaceChildren(h('div', { class: 'card narrow' },
      h('p', { class: 'status-big' }, 'All done ✓'),
      h('p', null, 'Nothing from this delivery is left on this page.'),
      h('div', { class: 'row' }, h('a', { class: 'btn btn-tap', href: '#/share?' }, 'Send something back'))));
  }

  const finishIfComplete = async () => {
    if (!manifest || received < manifest.fileCount || done) return;
    done = true;
    progress.hidden = true;
    step(2);
    finish.hidden = false;
    status.textContent = 'Received ✓ This was a one-time delivery: save what you need before closing this tab.';
    await room.send({ t: 'ack' }).catch(() => {});
  };

  room
    .on('connected', ({ code: c }) => {
      clearTimeout(slow);
      status.textContent = 'Connected to the sender. Receiving…';
      // Small, for people who compare it with the sender.
      code.textContent = `Safety code: ${c}`;
      code.hidden = false;
    })
    .on('message', ({ inner }) => {
      if (inner.t !== 'manifest' || manifest) return;
      const m = parseManifest(inner);
      manifest = m;
      if (m.text) result.append(receivedText(m.text));
      if (m.fileCount) progress.hidden = false;
      void finishIfComplete();
    })
    .on('file-progress', ({ progress: p, inner }) => {
      progress.value = p;
      status.textContent = `Receiving ${safeFileName(inner.name)}… ${Math.round(p * 100)}%`;
    })
    .on('file', ({ inner, blob }) => {
      const url = URL.createObjectURL(blob);
      objectUrls.push(url);
      result.append(h('div', { class: 'file-card' },
        h('span', { class: 'file-icon', 'aria-hidden': 'true' }, '📄'),
        h('div', { class: 'file-info' }, h('strong', null, safeFileName(inner.name)), h('span', { class: 'muted' }, formatBytes(inner.size))),
        h('a', { class: 'btn btn-primary btn-small', href: url, download: safeFileName(inner.name) }, 'Download')));
      received++;
      void finishIfComplete();
    })
    .on('denied', ({ reason }) => fail((DENY_REASONS as Record<string, string>)[reason] ?? `Could not receive (${reason}).`, reason === 'passphrase'))
    .on('closed', ({ reason }) => { if (!done && reason !== 'left') fail(DENY_REASONS[reason], false); });

  function fail(text: string, canRetry: boolean): void {
    clearTimeout(slow);
    void room.leave();
    status.textContent = text;
    status.classList.add('error');
    if (canRetry) result.append(h('button', { class: 'btn', onclick: retry }, 'Try again'));
  }

  return {
    leave() {
      clearTimeout(slow);
      void room.leave();
      objectUrls.forEach((u) => URL.revokeObjectURL(u));
    },
  };
}
