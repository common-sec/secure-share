import { h, copyText, formatBytes, safeFileName } from '../lib/dom.js';
import { SecureRoom, DENY_REASONS, MAX_TEXT, MAX_FILE_BYTES } from '../lib/room.js';
import { readInvite } from './chat.js';
import { passphraseField, copyRow } from './widgets.js';

export function mount(root, params) {
  let session = null;
  const invite = readInvite(params);
  if (invite) history.replaceState(null, '', '#/share');

  root.append(h('section', { class: 'page-head' },
    h('h1', null, 'Secure Share'),
    invite
      ? h('p', { class: 'lead' }, 'Someone sent you a one-time, end-to-end encrypted delivery.')
      : [
        h('p', { class: 'lead' },
          'Encrypted transfer from computer to computer, browser to browser. Ideal for passwords and sensitive files, between any kind of user.'),
        h('p', { class: 'lead' },
          'No special software needed: it works in any modern browser, and nothing is uploaded or stored anywhere. For longer or back-and-forth exchanges, open a ',
          h('a', { href: '#/chat' }, 'Secure Chat'), ' channel instead.'),
      ],
  ));
  const body = h('div');
  root.append(body);

  if (invite) receiveForm(body, invite, (s) => { session = s; });
  else sendForm(body, (s) => { session = s; });

  return () => session?.leave();
}

// ---------------------------------------------------------------- sender
function sendForm(body, setSession) {
  const files = [];
  const text = h('textarea', { rows: 5, maxlength: MAX_TEXT, placeholder: 'Paste a password, a note, a key…' });
  const fileList = h('ul', { class: 'file-list' });
  const fileInput = h('input', { type: 'file', multiple: true, hidden: true, onchange: (e) => { addFiles(e.target.files); e.target.value = ''; } });
  const drop = h('div', { class: 'dropzone' }, 'Drop files here, or ',
    h('button', { type: 'button', class: 'btn btn-small', onclick: () => fileInput.click() }, 'choose files'), fileInput);
  const pass = passphraseField({ generate: true });
  const approve = h('input', { type: 'checkbox' });
  const error = h('p', { class: 'error', hidden: true });

  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); addFiles(e.dataTransfer.files); });

  function addFiles(list) {
    for (const f of list) {
      if (f.size > MAX_FILE_BYTES) { showError(`${f.name} is larger than ${formatBytes(MAX_FILE_BYTES)}.`); continue; }
      files.push(f);
    }
    renderFiles();
  }
  function renderFiles() {
    fileList.replaceChildren(...files.map((f, i) => h('li', null,
      h('span', null, '📄 ', f.name), h('span', { class: 'muted' }, formatBytes(f.size)),
      h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: () => { files.splice(i, 1); renderFiles(); } }, '✕'))));
  }
  const showError = (msg) => { error.textContent = msg; error.hidden = false; };

  const submit = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Create one-time link');
  body.append(h('form', { class: 'card narrow', onsubmit: async (e) => {
    e.preventDefault();
    error.hidden = true;
    const passphrase = pass.input.value.trim();
    if (!text.value.trim() && files.length === 0) return showError('Add some text or at least one file.');
    if (!passphrase) return showError('A passphrase is required.');
    submit.disabled = true;
    submit.textContent = 'Deriving keys…';
    try {
      const room = await SecureRoom.host({ app: 'share', passphrase, nick: 'Sender', maxGuests: 1, autoAccept: !approve.checked });
      setSession(senderView(body, room, { text: text.value, files, passphrase }));
    } catch (err) {
      showError(`Could not start: ${err.message}`);
      submit.disabled = false;
      submit.textContent = 'Create one-time link';
    }
  } },
  h('div', { class: 'field' }, h('label', null, 'Text'), text),
  drop, fileList,
  h('div', { class: 'field' }, h('label', null, 'Passphrase'), pass.el,
    h('p', { class: 'hint' }, 'The recipient needs it in addition to the link. Send it through a different channel.')),
  h('label', { class: 'check' }, approve, h('span', null, 'Ask me before delivering', h('small', null, 'confirm the recipient and safety code first'))),
  error,
  h('div', { class: 'row' }, submit),
  ));
  body.append(h('aside', { class: 'card narrow guide' },
    h('h2', null, 'Which one should I use?'),
    h('ul', null,
      h('li', null, h('strong', null, 'Secure Share'), ' (this page): send something ', h('em', null, 'once'),
        ' to ', h('em', null, 'one'), ' person: a password, a key, a document. The link stops working after delivery.'),
      h('li', null, h('strong', null, h('a', { href: '#/chat' }, 'Secure Chat')), ': several things to exchange, replies, or more than two people. You host a private room and approve everyone who joins.'),
      h('li', null, 'Either way, nothing is uploaded: data goes straight from browser to browser, end-to-end encrypted, and both people need the link ',
        h('em', null, 'and'), ' the passphrase.'),
    ),
  ));
}

function senderView(body, room, { text, files, passphrase }) {
  const status = h('p', { class: 'status-big' });
  const steps = h('ol', { class: 'progress-steps' },
    h('li', { class: 'active' }, 'Share the link and passphrase'),
    h('li', null, 'Recipient connects'),
    h('li', null, 'Delivered, link destroyed'));
  const extra = h('div');
  const cancel = h('button', { class: 'btn btn-ghost', onclick: () => { location.hash = '#/share?'; } }, 'Cancel');
  let delivered = false;

  const step = (n) => [...steps.children].forEach((li, i) => {
    li.classList.toggle('done', i < n);
    li.classList.toggle('active', i === n);
  });
  const setStatus = (t) => { status.textContent = t; };

  body.replaceChildren(h('div', { class: 'card narrow' },
    steps,
    copyRow('One-time link', room.link('share'), true),
    copyRow('Passphrase', passphrase, true),
    h('p', { class: 'hint warn' }, '⚠ Keep this tab open until the delivery completes. Nothing is stored on a server, so closing it cancels the share.'),
    status, extra,
    h('div', { class: 'row' }, cancel),
  ));
  setStatus('Waiting for the recipient to open the link…');

  room
    .on('auth-failed', ({ failures }) => extra.append(h('p', { class: 'error' }, `Someone entered a wrong passphrase (${failures}).`)))
    .on('lock', ({ auto }) => auto && setStatus('Locked after repeated wrong passphrases. Cancel and create a new link.'))
    .on('request', ({ peerId, code }) => {
      setStatus('Someone with the right passphrase wants to receive it.');
      extra.replaceChildren(h('div', { class: 'request' },
        h('div', null, 'Safety code ', h('strong', { class: 'mono' }, code ?? '…'), h('div', { class: 'hint' }, 'It should match the code on the recipient’s screen.')),
        h('div', { class: 'row tight' },
          h('button', { class: 'btn btn-primary btn-small', onclick: () => { extra.replaceChildren(); room.accept(peerId); } }, 'Deliver'),
          h('button', { class: 'btn btn-small', onclick: () => { extra.replaceChildren(); room.reject(peerId); setStatus('Declined. Still waiting…'); } }, 'Decline')),
      ));
    })
    .on('joined', async ({ member }) => {
      step(1);
      room.setLocked(true);
      setStatus(`Recipient connected (safety code ${member.code}). Sending…`);
      try {
        await room.send({ t: 'manifest', text, files: files.map((f) => ({ name: f.name, size: f.size })) });
        for (const [i, f] of files.entries()) {
          await room.sendFile(f, (p) => setStatus(`Sending ${f.name} (${i + 1}/${files.length}): ${Math.round(p * 100)}%`));
        }
        setStatus('Waiting for the recipient to confirm…');
      } catch (e) {
        setStatus(`Delivery failed: ${e.message}`);
      }
    })
    .on('message', ({ inner }) => {
      if (inner.t !== 'ack') return;
      delivered = true;
      step(3);
      setStatus('Delivered ✓ The room is closed and the link no longer works.');
      cancel.textContent = 'Share something else';
      room.leave();
    })
    .on('left', () => {
      if (delivered) return;
      step(0);
      room.setLocked(false);
      setStatus('The recipient disconnected before finishing. Waiting for them to reconnect…');
    });

  return { leave: () => room.leave() };
}

// ---------------------------------------------------------------- recipient
function receiveForm(body, invite, setSession) {
  const pass = passphraseField({ generate: false });
  const error = h('p', { class: 'error', hidden: true });
  const submit = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Receive');
  body.replaceChildren(h('form', { class: 'card narrow', onsubmit: async (e) => {
    e.preventDefault();
    const passphrase = pass.input.value.trim();
    if (!passphrase) { error.textContent = 'Enter the passphrase the sender gave you.'; error.hidden = false; return; }
    submit.disabled = true;
    submit.textContent = 'Deriving keys…';
    try {
      const room = await SecureRoom.join({ app: 'share', ...invite, passphrase, nick: 'Recipient' });
      setSession(receiverView(body, room, () => receiveForm(body, invite, setSession)));
    } catch (err) {
      error.textContent = `Could not start: ${err.message}`;
      error.hidden = false;
      submit.disabled = false;
      submit.textContent = 'Receive';
    }
  } },
  h('div', { class: 'field' }, h('label', null, 'Passphrase'), pass.el,
    h('p', { class: 'hint' }, 'The sender should have given you this separately from the link.')),
  error,
  h('div', { class: 'row' }, submit),
  ));
  pass.input.focus();
}

function receiverView(body, room, retry) {
  const status = h('p', { class: 'status-big' }, 'Looking for the sender…');
  const result = h('div', { class: 'result' });
  const objectUrls = [];
  let manifest = null;
  let received = 0;
  let done = false;
  const progress = h('progress', { max: 1, value: 0, hidden: true });

  body.replaceChildren(h('div', { class: 'card narrow' }, status, progress, result));
  const slow = setTimeout(() => {
    if (!done) status.textContent = 'Still looking. The sender’s tab must be open. The link may have already been used.';
  }, 20000);

  const finishIfComplete = async () => {
    if (!manifest || received < manifest.files.length || done) return;
    done = true;
    progress.hidden = true;
    status.textContent = 'Received ✓ This was a one-time delivery: save what you need before closing this tab.';
    await room.send({ t: 'ack' }).catch(() => {});
  };

  room
    .on('connected', ({ code }) => {
      clearTimeout(slow);
      status.textContent = `Connected to the sender. Safety code: ${code}`;
    })
    .on('message', ({ inner }) => {
      if (inner.t !== 'manifest' || manifest) return;
      manifest = { text: String(inner.text ?? ''), files: Array.isArray(inner.files) ? inner.files : [] };
      if (manifest.text) {
        const btn = h('button', { class: 'btn btn-small', onclick: () => copyText(manifest.text, btn) }, 'Copy');
        result.append(h('div', { class: 'field' },
          h('div', { class: 'row spread' }, h('label', null, 'Text'), btn),
          h('pre', { class: 'secret' }, manifest.text)));
      }
      if (manifest.files.length) progress.hidden = false;
      finishIfComplete();
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
      finishIfComplete();
    })
    .on('denied', ({ reason }) => fail(DENY_REASONS[reason] ?? `Could not receive (${reason}).`, reason === 'passphrase'))
    .on('closed', ({ reason }) => { if (!done && reason !== 'left') fail(DENY_REASONS[reason] ?? 'The share was closed.', false); });

  function fail(text, canRetry) {
    clearTimeout(slow);
    room.leave();
    status.textContent = text;
    status.classList.add('error');
    if (canRetry) result.append(h('button', { class: 'btn', onclick: retry }, 'Try again'));
  }

  return {
    leave() {
      clearTimeout(slow);
      room.leave();
      objectUrls.forEach((u) => URL.revokeObjectURL(u));
    },
  };
}
