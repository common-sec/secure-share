// SecureRoom: a star-shaped, host-controlled, end-to-end encrypted WebRTC room.
//
// Transport & NAT traversal: Trystero (WebRTC, discovery over public Nostr relays).
// Topology: guests connect ONLY to the host; the host relays. Guests never see each other's IPs.
//
// Joining (inside Trystero's onPeerHandshake, before any app data flows):
//   1. both send hello {role, pub, nonce}; guests refuse anyone who isn't the host
//   2. host proves identity: ECDSA signature over both nonces, checked against the key
//      fingerprint in the link, so the host can't be impersonated even with a stolen link
//   3. guest proves the passphrase: HMAC(authKey, nonces, guest key, nick). Nothing derived from
//      the passphrase is sent to an unverified party, so it can only be guessed online.
//   4. host replies ok / {reason}. Then the host approves (or auto-accepts) the guest.
//
// Messages: {d: JSON, s: ECDSA signature by the sender's per-session key} sealed with the
// AES-GCM group key. Receivers check the signature against the roster the host publishes, so
// members (and the relaying host) can't forge each other's messages or nicknames.
import { loadTrystero } from '../vendor/trystero.js';
import * as C from './crypto.js';
import { bytesToB64url } from './encoding.js';

export const MAX_FILE_BYTES = 512 * 1024 ** 2;
export const MAX_TEXT = 100_000;
const MAX_FAILURES = 5;

export const DENY_REASONS = {
  passphrase: 'Wrong passphrase.',
  locked: 'The room is locked. Ask the host to unlock it.',
  full: 'The room is full.',
  'nick-taken': 'That nickname is already taken in this room.',
  nick: 'Please choose a nickname.',
  rejected: 'The host declined your request to join.',
  kicked: 'The host removed you from the room.',
  closed: 'The host closed the room.',
  'host-left': 'The host left, so the room is closed.',
};

export function cleanNick(nick) {
  return String(nick ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 32);
}

export class SecureRoom extends EventTarget {
  /**
   * Creates a room, or resumes one after a page reload when `restore` holds the saved host state
   * ({roomId, secret, identity, keys, approved}). See snapshot().
   */
  static async host({ app, passphrase, nick, maxGuests = 7, autoAccept = false, restore = null }) {
    const room = new SecureRoom({
      app, roomId: restore?.roomId ?? C.randomId(16), secret: restore?.secret ?? C.randomId(32),
      passphrase, nick: restore?.nick ?? nick, maxGuests, autoAccept,
    });
    room.isHost = true;
    room.identity = restore?.identity ?? await C.newIdentity();
    room.keys = restore?.keys ?? null;
    room.approved = new Map(restore?.approved ?? []);
    room.hostFp = room.identity.fp;
    room.members.set(room.identity.id, { id: room.identity.id, nick: room.nick, pub: room.identity.pub, host: true });
    await room.#connect();
    return room;
  }

  static async join({ app, roomId, secret, hostFp, passphrase, nick }) {
    const room = new SecureRoom({ app, roomId, secret, passphrase, nick });
    room.isHost = false;
    room.identity = await C.newIdentity();
    room.hostFp = hostFp;
    await room.#connect();
    return room;
  }

  constructor({ app, roomId, secret, passphrase, nick, maxGuests = 0, autoAccept = false }) {
    super();
    Object.assign(this, { app, roomId, secret, passphrase, maxGuests, autoAccept });
    this.nick = cleanNick(nick);
    this.members = new Map(); // memberId -> {id, nick, pub, host, peerId?}
    this.guests = new Map(); // host only: peerId -> {id, nick, pub, code, state: 'pending' | 'member'}
    this.handshakes = new Map(); // host only: peerId -> verified hello
    this.banned = new Set();
    this.approved = new Map(); // host only: guest public key -> nickname, re-admitted automatically
    this.seen = new Set();
    this.fileMeta = new Map();
    this.locked = false;
    this.failures = 0;
    this.accepted = false;
    this.closed = false;
  }

  get self() { return this.members.get(this.identity.id) ?? { id: this.identity.id, nick: this.nick, host: this.isHost }; }

  link(route) {
    return `${location.origin}${location.pathname}#/${route}?r=${this.roomId}&k=${this.secret}&h=${this.hostFp}`;
  }

  on(type, fn) { this.addEventListener(type, (e) => fn(e.detail)); return this; }
  #emit(type, detail = {}) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  /** Host state needed to resume after a reload. Keys are non-extractable CryptoKeys (IndexedDB-safe). */
  snapshot() {
    return {
      roomId: this.roomId, secret: this.secret, hostFp: this.hostFp, nick: this.nick,
      identity: this.identity, keys: this.keys, approved: [...this.approved],
    };
  }

  async #connect() {
    const [{ joinRoom }, keys] = await Promise.all([
      loadTrystero(), this.keys ?? C.deriveRoomKeys(this.roomId, this.secret, this.passphrase),
    ]);
    this.keys = keys;
    this.passphrase = null;
    this.room = joinRoom(
      { appId: `user-sec-tools.${this.app}.v2`, password: keys.signalingPassword, maxReceiveBytes: MAX_FILE_BYTES + 4096 },
      this.roomId,
      {
        onPeerHandshake: (peerId, send, receive) => (this.isHost
          ? this.#hostHandshake(peerId, send, receive)
          : this.#guestHandshake(peerId, send, receive)),
        onJoinError: (d) => {
          if (!/not-host/.test(d.error)) this.#emit('debug', d);
        },
        handshakeTimeoutMs: 15000,
      },
    );

    this.ctlAction = this.room.makeAction('ctl');
    this.msgAction = this.room.makeAction('msg');
    this.fileAction = this.room.makeAction('file');
    // Incoming data is handled strictly in arrival order (e.g. 'welcome' before the first message).
    let inbox = Promise.resolve();
    const queue = (fn) => (data, ctx) => { inbox = inbox.then(() => fn(data, ctx)).catch(() => {}); };
    this.ctlAction.onMessage = queue((data, ctx) => this.#onCtl(data, ctx));
    this.msgAction.onMessage = queue((data, ctx) => this.#onMsg(data, ctx));
    this.fileAction.onMessage = queue((data, ctx) => this.#onFile(data, ctx));
    // Membership is re-checked when the data is processed; here only the connection matters.
    this.fileAction.onReceive = ({ peerId, byteLength }) => byteLength <= MAX_FILE_BYTES + 1024
      && (this.isHost ? this.guests.has(peerId) : peerId === this.hostPeerId);
    this.fileAction.onReceiveProgress = async (p, { peerId, metadata }) => {
      if (!this.#trusted(peerId)) return;
      const meta = await this.#readFileMeta(metadata?.m);
      if (meta) this.#emit('file-progress', { key: metadata.m, progress: p, ...meta });
    };
    this.room.onPeerJoin = (peerId) => this.#onPeerJoin(peerId).catch(() => {});
    this.room.onPeerLeave = (peerId) => this.#onPeerLeave(peerId);
  }

  // ---- handshake ----
  async #hostHandshake(peerId, send, receive) {
    const nonce = C.randomId(16);
    await send({ v: 2, role: 'host', pub: this.identity.pub, nonce });
    const { data: hello } = await receive();
    if (hello?.role !== 'guest' || typeof hello.pub !== 'string' || typeof hello.nonce !== 'string') throw new Error('protocol');
    await send({ sig: await C.sign(this.identity, `uss-host|${hello.nonce}|${nonce}`) });
    const { data: answer } = await receive();

    const deny = async (reason) => {
      await send({ ok: false, reason }).catch(() => {});
      throw new Error(reason);
    };
    if (this.locked || this.banned.has(hello.pub)) return deny('locked');
    const nickRaw = String(hello.nick ?? '');
    const ok = await C.checkProof(this.keys.authKey, String(answer?.proof ?? ''), 'uss-join', nonce, hello.nonce, hello.pub, nickRaw);
    if (!ok) {
      this.failures++;
      this.#emit('auth-failed', { failures: this.failures });
      if (this.failures >= MAX_FAILURES) this.setLocked(true, true);
      return deny('passphrase');
    }
    const nick = cleanNick(nickRaw);
    if (!nick) return deny('nick');
    if (this.guests.size >= this.maxGuests) return deny('full');
    const lower = nick.toLowerCase();
    const taken = [...this.members.values(), ...this.guests.values()].some((m) => m.nick.toLowerCase() === lower);
    if (taken) return deny('nick-taken');

    const id = (await C.fingerprint(hello.pub)).slice(0, 16);
    this.handshakes.set(peerId, { id, nick, pub: hello.pub });
    await send({ ok: true });
  }

  async #guestHandshake(peerId, send, receive) {
    const nonce = C.randomId(16);
    await send({ v: 2, role: 'guest', pub: this.identity.pub, nonce, nick: this.nick });
    const { data: hello } = await receive();
    if (hello?.role !== 'host') throw new Error('not-host');
    if (await C.fingerprint(String(hello.pub)) !== this.hostFp) throw new Error('not-host');
    await send({ proof: await C.proof(this.keys.authKey, 'uss-join', hello.nonce, nonce, this.identity.pub, this.nick) });
    const { data: s } = await receive();
    if (!await C.verify(hello.pub, `uss-host|${nonce}|${hello.nonce}`, String(s?.sig ?? ''))) throw new Error('not-host');
    const { data: result } = await receive();
    if (!result?.ok) {
      // Ignore redundant handshake attempts once we're already connected to the host.
      if (!this.hostPeerId && !this.closed) this.#emit('denied', { reason: String(result?.reason ?? 'unknown') });
      throw new Error(String(result?.reason));
    }
    this.hostPeerId = peerId;
    this.hostPub = hello.pub;
  }

  async #onPeerJoin(peerId) {
    const code = await C.safetyCode(this.room.getPeers()[peerId]);
    if (this.isHost) {
      const info = this.handshakes.get(peerId);
      this.handshakes.delete(peerId);
      if (!info) return this.#drop(peerId);
      this.guests.set(peerId, { ...info, code, state: 'pending' });
      if (this.autoAccept || this.approved.get(info.pub) === info.nick) this.accept(peerId);
      else this.#emit('request', { peerId, nick: info.nick, code });
    } else if (peerId === this.hostPeerId) {
      this.hostCode = code;
      this.#emit('connected', { code });
    }
  }

  #onPeerLeave(peerId) {
    if (this.isHost) {
      const g = this.guests.get(peerId);
      if (!g) return;
      this.guests.delete(peerId);
      if (g.state === 'member') {
        this.members.delete(g.id);
        this.#broadcastRoster();
        this.#emit('left', { member: g });
      } else {
        this.#emit('request-cancelled', { peerId });
      }
    } else if (peerId === this.hostPeerId && !this.closed) {
      // The host may just be reloading; keep listening and re-handshake when they're back.
      this.hostPeerId = null;
      this.accepted = false;
      this.#emit('host-lost');
    }
  }

  #trusted(peerId) {
    return this.isHost ? this.guests.get(peerId)?.state === 'member' : peerId === this.hostPeerId && this.accepted;
  }

  #memberPeers(except) {
    return [...this.guests].filter(([id, g]) => g.state === 'member' && id !== except).map(([id]) => id);
  }

  #drop(peerId) {
    setTimeout(() => this.room?.getPeers()[peerId]?.close(), 400);
  }

  // ---- host controls ----
  async accept(peerId) {
    const g = this.guests.get(peerId);
    if (!g || g.state !== 'pending') return;
    g.state = 'member';
    this.approved.set(g.pub, g.nick);
    this.#emit('persist');
    this.members.set(g.id, { id: g.id, nick: g.nick, pub: g.pub, host: false, peerId, code: g.code });
    await this.#sendCtl({ t: 'welcome' }, [peerId]);
    await this.#broadcastRoster();
    this.#emit('joined', { member: this.members.get(g.id) });
  }

  async reject(peerId) {
    const g = this.guests.get(peerId);
    if (!g) return;
    this.guests.delete(peerId);
    this.banned.add(g.pub);
    if (this.approved.delete(g.pub)) this.#emit('persist');
    await this.#sendCtl({ t: 'bye', reason: 'rejected' }, [peerId]).catch(() => {});
    this.#drop(peerId);
  }

  async kick(memberId) {
    const m = this.members.get(memberId);
    if (!m || m.host) return;
    this.banned.add(m.pub);
    if (this.approved.delete(m.pub)) this.#emit('persist');
    await this.#sendCtl({ t: 'bye', reason: 'kicked' }, [m.peerId]).catch(() => {});
    this.guests.delete(m.peerId);
    this.members.delete(memberId);
    this.#drop(m.peerId);
    await this.#broadcastRoster();
    this.#emit('left', { member: m, kicked: true });
  }

  setLocked(locked, auto = false) {
    this.locked = locked;
    if (!locked) this.failures = 0;
    this.#emit('lock', { locked, auto });
  }

  async #broadcastRoster() {
    const members = [...this.members.values()].map(({ id, nick, pub, host }) => ({ id, nick, pub, host }));
    this.#emit('roster', { members: [...this.members.values()] });
    const targets = this.#memberPeers();
    if (targets.length) await this.#sendCtl({ t: 'roster', members }, targets);
  }

  async #sendCtl(obj, targets) {
    if (!targets.length) return;
    await this.ctlAction.send(await C.sealJson(this.keys.groupKey, obj), { target: targets });
  }

  // ---- control messages (guest side) ----
  async #onCtl(data, { peerId }) {
    if (this.isHost || peerId !== this.hostPeerId) return;
    const msg = await C.openJson(this.keys.groupKey, data);
    if (msg.t === 'welcome') {
      this.accepted = true;
      this.#emit('accepted');
    } else if (msg.t === 'roster' && Array.isArray(msg.members)) {
      const hostEntry = msg.members.find((m) => m.host);
      if (!hostEntry || hostEntry.pub !== this.hostPub) return;
      this.members = new Map(msg.members.map((m) => [m.id, { id: m.id, nick: cleanNick(m.nick), pub: m.pub, host: !!m.host }]));
      this.#emit('roster', { members: [...this.members.values()] });
    } else if (msg.t === 'bye') {
      this.#close(DENY_REASONS[msg.reason] ? msg.reason : 'closed');
    }
  }

  // ---- messages ----
  async #envelope(fields) {
    const inner = { ...fields, id: C.randomId(12), from: this.identity.id, ts: Date.now() };
    const d = JSON.stringify(inner);
    return { inner, sealed: await C.sealJson(this.keys.groupKey, { d, s: await C.sign(this.identity, d) }) };
  }

  #targets() {
    if (this.isHost) return this.#memberPeers();
    return this.accepted ? [this.hostPeerId] : [];
  }

  /** Sends a signed, encrypted message ({t: 'text', body} or any app-defined type). */
  async send(fields) {
    if (fields.t === 'text' && String(fields.body).length > MAX_TEXT) throw new Error('Message too long');
    const targets = this.#targets();
    if (!targets.length) throw new Error('Nobody to send to yet');
    const { inner, sealed } = await this.#envelope(fields);
    this.seen.add(inner.id);
    await this.msgAction.send(sealed, { target: targets });
    return inner;
  }

  async #verifyEnvelope(sealed, peerId) {
    const { d, s } = await C.openJson(this.keys.groupKey, sealed);
    const inner = JSON.parse(d);
    const member = this.members.get(inner.from);
    if (!member || !(await C.verify(member.pub, d, s))) return null;
    // The host only accepts a member's messages from that member's own connection.
    if (this.isHost && member.peerId !== peerId) return null;
    return { inner, member };
  }

  async #onMsg(data, { peerId }) {
    if (!this.#trusted(peerId)) return;
    const v = await this.#verifyEnvelope(data, peerId);
    if (!v || this.seen.has(v.inner.id)) return;
    this.seen.add(v.inner.id);
    if (this.isHost) {
      const others = this.#memberPeers(peerId);
      if (others.length) this.msgAction.send(data, { target: others }).catch(() => {});
    }
    this.#emit('message', v);
  }

  // ---- files ----
  async sendFile(file, onProgress) {
    if (file.size > MAX_FILE_BYTES) throw new Error('File too large');
    const targets = this.#targets();
    if (!targets.length) throw new Error('Nobody to send to yet');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const hash = bytesToB64url(await C.sha256(bytes));
    const { inner, sealed: m } = await this.#envelope({ t: 'file', name: file.name, size: file.size, type: file.type, sha256: hash });
    this.seen.add(inner.id);
    const data = await C.seal(this.keys.groupKey, bytes);
    await this.fileAction.send(data, { target: targets, metadata: { m }, onProgress: (p) => onProgress?.(p) });
    return inner;
  }

  #readFileMeta(m) {
    if (typeof m !== 'string') return Promise.resolve(null);
    if (!this.fileMeta.has(m)) {
      this.fileMeta.set(m, C.openJson(this.keys.groupKey, m).then(async ({ d, s }) => {
        const inner = JSON.parse(d);
        const member = this.members.get(inner.from);
        if (inner.t !== 'file' || !member || !(await C.verify(member.pub, d, s))) return null;
        return { inner, member };
      }).catch(() => null).then((meta) => {
        if (!meta) this.fileMeta.delete(m); // may succeed later, once the roster arrives
        return meta;
      }));
    }
    return this.fileMeta.get(m);
  }

  async #onFile(data, { peerId, metadata }) {
    if (!this.#trusted(peerId)) return;
    const meta = await this.#readFileMeta(metadata?.m);
    if (!meta || this.seen.has(meta.inner.id)) return;
    if (this.isHost && meta.member.peerId !== peerId) return;
    const bytes = await C.open(this.keys.groupKey, data);
    if (bytes.length !== meta.inner.size || bytesToB64url(await C.sha256(bytes)) !== meta.inner.sha256) return;
    this.seen.add(meta.inner.id);
    this.fileMeta.delete(metadata.m);
    if (this.isHost) {
      const others = this.#memberPeers(peerId);
      if (others.length) this.fileAction.send(data, { target: others, metadata }).catch(() => {});
    }
    this.#emit('file', { ...meta, key: metadata.m, blob: new Blob([bytes], { type: 'application/octet-stream' }) });
  }

  // ---- lifecycle ----
  #close(reason) {
    if (this.closed) return;
    this.closed = true;
    this.room?.leave();
    this.#emit('closed', { reason });
  }

  async leave() {
    if (this.closed) return;
    if (this.isHost) {
      await this.#sendCtl({ t: 'bye', reason: 'closed' }, [...this.guests.keys()]).catch(() => {});
    }
    this.#close('left');
  }
}
