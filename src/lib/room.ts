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
//
// Everything received from a peer is untrusted: it's validated (parse*) before use. The message
// shapes below are the ones specified in docs/PROTOCOL.md.
import type { HandshakeReceiver, HandshakeSender, JoinError, JsonValue, MessageAction, Room } from 'trystero';
import { loadTrystero, type Trystero } from '../vendor/trystero.js';
import * as C from './crypto.js';
import { bytesToB64url } from './encoding.js';

export const MAX_FILE_BYTES = 512 * 1024 ** 2;
export const MAX_TEXT = 100_000;
const MAX_FAILURES = 5;
// Public Nostr relays used for discovery. Fewer relays = fewer third parties seeing that a room
// exists; 3 keeps some redundancy if one is down. Peers of the same app pick the same subset.
const RELAY_REDUNDANCY = 3;
// Every room closes on its own after a while, so a forgotten tab doesn't keep connections open.
export const DEFAULT_LIFETIME_MS = 4 * 60 * 60 * 1000;
export const MAX_LIFETIME_MS = 24 * 60 * 60 * 1000;
/** How long before the end members are warned ('expiring'). */
export const EXPIRY_WARNING_MS = 10 * 60 * 1000;
/** How long the relays may stay unreachable, while the room needs them, before we say so. */
export const RELAY_CHECK_MS = 10_000;
// Trystero's onJoinError when two peers exchanged offers through the relays but WebRTC found no
// path between them: usually a firewall blocking UDP or WebRTC, or both sides behind strict NATs.
const DIRECT_FAILED = /after exchanging SDP/;

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
  expired: 'The room reached its time limit and closed. The link no longer works.',
} as const;
export type DenyReason = keyof typeof DENY_REASONS;
const isDenyReason = (r: unknown): r is DenyReason => typeof r === 'string' && Object.hasOwn(DENY_REASONS, r);

/** The subset of Trystero's API SecureRoom uses (the tests provide an in-memory implementation). */
export type Transport = Pick<Trystero, 'joinRoom' | 'getRelaySockets' | 'pauseRelayReconnection' | 'resumeRelayReconnection'>;

// ---------------------------------------------------------------- protocol shapes (PROTOCOL.md)
export interface Member {
  id: string;
  nick: string;
  pub: string;
  host: boolean;
  /** host only: the member's connection */
  peerId?: string;
  /** host only: the pairwise safety code */
  code?: string | null;
}

interface Guest {
  id: string;
  nick: string;
  pub: string;
  code: string | null;
  state: 'pending' | 'member';
}

interface Hello { v: 2; role: 'host' | 'guest'; pub: string; nonce: string; nick?: string }
type Ctl =
  | { t: 'welcome'; ttl?: number }
  | { t: 'roster'; members: Array<Pick<Member, 'id' | 'nick' | 'pub' | 'host'>> }
  | { t: 'bye'; reason: DenyReason };

/** The signed part of an envelope. App-defined fields (body, name, …) are untrusted `unknown`s. */
export interface Inner {
  t: string;
  id: string;
  from: string;
  ts: number;
  [field: string]: unknown;
}
export interface FileInner extends Inner { t: 'file'; name: string; size: number; type: string; sha256: string }
interface Envelope { d: string; s: string }

export interface HostSnapshot {
  roomId: string;
  secret: string;
  hostFp: string;
  nick: string;
  identity: C.Identity;
  keys: C.RoomKeys;
  approved: Array<[pub: string, nick: string]>;
  /** when the room closes (epoch ms); older records without it get the default lifetime */
  expiresAt?: number;
}

// ---------------------------------------------------------------- validation of peer data
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

function parseHello(v: unknown): Hello | null {
  if (!isObj(v) || v.v !== 2 || (v.role !== 'host' && v.role !== 'guest') || !isStr(v.pub) || !isStr(v.nonce)) return null;
  return { v: 2, role: v.role, pub: v.pub, nonce: v.nonce, ...(isStr(v.nick) ? { nick: v.nick } : {}) };
}

function parseCtl(v: unknown): Ctl | null {
  if (!isObj(v)) return null;
  if (v.t === 'welcome') {
    const ttl = typeof v.ttl === 'number' && v.ttl > 0 && v.ttl <= MAX_LIFETIME_MS ? v.ttl : undefined;
    return ttl === undefined ? { t: 'welcome' } : { t: 'welcome', ttl };
  }
  if (v.t === 'bye') return { t: 'bye', reason: isDenyReason(v.reason) ? v.reason : 'closed' };
  if (v.t === 'roster' && Array.isArray(v.members)) {
    const members = v.members.filter(isObj).filter((m) => isStr(m.id) && isStr(m.nick) && isStr(m.pub))
      .map((m) => ({ id: m.id as string, nick: cleanNick(m.nick), pub: m.pub as string, host: m.host === true }));
    return { t: 'roster', members };
  }
  return null;
}

function parseEnvelope(v: unknown): Envelope | null {
  return isObj(v) && isStr(v.d) && isStr(v.s) ? { d: v.d, s: v.s } : null;
}

function parseInner(d: string): Inner | null {
  let v: unknown;
  try { v = JSON.parse(d); } catch { return null; }
  if (!isObj(v) || !isStr(v.t) || !isStr(v.id) || !isStr(v.from) || typeof v.ts !== 'number') return null;
  return v as Inner;
}

function isFileInner(inner: Inner): inner is FileInner {
  return inner.t === 'file' && isStr(inner.name) && typeof inner.size === 'number' && isStr(inner.type) && isStr(inner.sha256);
}

export function cleanNick(nick: unknown): string {
  return String(nick ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 32);
}

// ---------------------------------------------------------------- events
export interface RoomEvents {
  debug: JoinError;
  'auth-failed': { failures: number };
  lock: { locked: boolean; auto: boolean };
  request: { peerId: string; nick: string; code: string | null };
  'request-cancelled': { peerId: string };
  connected: { code: string | null };
  accepted: Record<string, never>;
  denied: { reason: string };
  'host-lost': Record<string, never>;
  /** a peer found the room through the relays, but no direct connection could be opened to it */
  'direct-blocked': { peerId: string };
  /** whether any discovery relay is reachable; sent when that changes while the room needs them */
  relays: { reachable: boolean };
  /** the room closes in EXPIRY_WARNING_MS or less */
  expiring: { expiresAt: number };
  persist: Record<string, never>;
  joined: { member: Member };
  left: { member: Member | Guest; kicked?: boolean };
  roster: { members: Member[] };
  discovery: { on: boolean };
  message: { inner: Inner; member: Member };
  'file-progress': { key: string; progress: number; inner: FileInner; member: Member };
  file: { key: string; inner: FileInner; member: Member; blob: Blob };
  closed: { reason: DenyReason | 'left' };
}

interface HostOptions {
  app: string;
  passphrase?: string;
  nick?: string;
  maxGuests?: number;
  autoAccept?: boolean;
  /** how long the room stays open (clamped to MAX_LIFETIME_MS); ignored when resuming */
  lifetimeMs?: number;
  restore?: HostSnapshot | null;
  transport?: Transport | null;
}

interface JoinOptions {
  app: string;
  roomId: string;
  secret: string;
  hostFp: string;
  passphrase: string;
  nick: string;
  transport?: Transport | null;
}

interface FileMeta { inner: FileInner; member: Member }

// Test-only hooks (see docs/ARCHITECTURE.md): the end-to-end tests point discovery at a local
// relay and skip STUN. Only a script running in the page before the app can set them, and such a
// script already controls the page, so they add no capability. Links and user input can't.
interface TestHooks { __USS_TEST_RELAYS__?: unknown; __USS_TEST_ICE_SERVERS__?: unknown }

export class SecureRoom extends EventTarget {
  /**
   * Creates a room, or resumes one after a page reload when `restore` holds the saved host state
   * (see snapshot()).
   */
  static async host({ app, passphrase = '', nick = '', maxGuests = 7, autoAccept = false, lifetimeMs = DEFAULT_LIFETIME_MS, restore = null, transport = null }: HostOptions): Promise<SecureRoom> {
    const identity = restore?.identity ?? await C.newIdentity();
    const room = new SecureRoom({
      app, roomId: restore?.roomId ?? C.randomId(16), secret: restore?.secret ?? C.randomId(32),
      passphrase, nick: restore?.nick ?? nick, maxGuests, autoAccept, transport,
      isHost: true, identity, hostFp: identity.fp,
    });
    room.keys = restore?.keys ?? null;
    room.approved = new Map(restore?.approved ?? []);
    room.expiresAt = restore?.expiresAt ?? Date.now() + Math.min(Math.max(lifetimeMs, 1000), MAX_LIFETIME_MS);
    room.members.set(identity.id, { id: identity.id, nick: room.nick, pub: identity.pub, host: true });
    await room.#connect();
    room.#watchExpiry();
    return room;
  }

  static async join({ app, roomId, secret, hostFp, passphrase, nick, transport = null }: JoinOptions): Promise<SecureRoom> {
    const room = new SecureRoom({
      app, roomId, secret, passphrase, nick, transport, maxGuests: 0, autoAccept: false,
      isHost: false, identity: await C.newIdentity(), hostFp,
    });
    await room.#connect();
    return room;
  }

  readonly app: string;
  readonly roomId: string;
  readonly secret: string;
  readonly hostFp: string;
  readonly isHost: boolean;
  readonly identity: C.Identity;
  readonly maxGuests: number;
  readonly autoAccept: boolean;
  readonly nick: string;
  /** `transport` defaults to Trystero; tests inject an in-memory implementation of the same API. */
  transport: Transport | null;
  keys: C.RoomKeys | null = null;
  room: Room | null = null;
  ctlAction: MessageAction<string> | null = null;
  msgAction: MessageAction<string> | null = null;
  fileAction: MessageAction<Uint8Array> | null = null;
  hostPeerId: string | null = null;
  hostPub: string | null = null;
  hostCode: string | null = null;
  members = new Map<string, Member>();
  /** host only: peerId -> guest */
  guests = new Map<string, Guest>();
  /** host only: guest public key -> nickname, re-admitted automatically */
  approved = new Map<string, string>();
  /** when the room closes (epoch ms, this device's clock); a guest learns it on acceptance */
  expiresAt: number | null = null;
  locked = false;
  accepted = false;
  closed = false;
  #passphrase: string | null;
  #handshakes = new Map<string, Omit<Guest, 'code' | 'state'>>();
  #banned = new Set<string>();
  #seen = new Set<string>();
  #fileMeta = new Map<string, Promise<FileMeta | null>>();
  #discoverable = true;
  #failures = 0;
  #expiryTimer: ReturnType<typeof setInterval> | undefined;
  #warned = false;
  #relayTimer: ReturnType<typeof setInterval> | undefined;
  #discoverableSince = 0;
  #relaysReachable = true;

  private constructor(o: {
    app: string; roomId: string; secret: string; passphrase: string; nick: string; maxGuests: number;
    autoAccept: boolean; transport: Transport | null; isHost: boolean; identity: C.Identity; hostFp: string;
  }) {
    super();
    this.app = o.app;
    this.roomId = o.roomId;
    this.secret = o.secret;
    this.#passphrase = o.passphrase;
    this.nick = cleanNick(o.nick);
    this.maxGuests = o.maxGuests;
    this.autoAccept = o.autoAccept;
    this.transport = o.transport;
    this.isHost = o.isHost;
    this.identity = o.identity;
    this.hostFp = o.hostFp;
  }

  get self(): Member {
    return this.members.get(this.identity.id) ?? { id: this.identity.id, nick: this.nick, pub: this.identity.pub, host: this.isHost };
  }

  link(route: string): string {
    return `${location.origin}${location.pathname}#/${route}?r=${this.roomId}&k=${this.secret}&h=${this.hostFp}`;
  }

  on<K extends keyof RoomEvents>(type: K, fn: (detail: RoomEvents[K]) => void): this {
    this.addEventListener(type, (e) => fn((e as CustomEvent<RoomEvents[K]>).detail));
    return this;
  }

  #emit<K extends keyof RoomEvents>(type: K, detail: RoomEvents[K]): void {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  get #k(): C.RoomKeys {
    if (!this.keys) throw new Error('room not connected');
    return this.keys;
  }

  /** Host state needed to resume after a reload. Keys are non-extractable CryptoKeys (IndexedDB-safe). */
  snapshot(): HostSnapshot {
    return {
      roomId: this.roomId, secret: this.secret, hostFp: this.hostFp, nick: this.nick,
      identity: this.identity, keys: this.#k, approved: [...this.approved],
      ...(this.expiresAt ? { expiresAt: this.expiresAt } : {}),
    };
  }

  async #connect(): Promise<void> {
    const [trystero, keys] = await Promise.all([
      this.transport ?? loadTrystero(),
      this.keys ?? C.deriveRoomKeys(this.roomId, this.secret, this.#passphrase ?? ''),
    ]);
    this.keys = keys;
    this.#passphrase = null;
    this.transport = trystero;
    const hooks = globalThis as TestHooks;
    const testRelays = Array.isArray(hooks.__USS_TEST_RELAYS__) ? hooks.__USS_TEST_RELAYS__.filter(isStr) : null;
    const testIceServers = Array.isArray(hooks.__USS_TEST_ICE_SERVERS__) ? hooks.__USS_TEST_ICE_SERVERS__ as RTCIceServer[] : null;
    const room = trystero.joinRoom(
      {
        appId: `user-sec-tools.${this.app}.v2`,
        password: keys.signalingPassword,
        maxReceiveBytes: MAX_FILE_BYTES + 4096,
        // We decide when to reconnect to relays (see #syncDiscovery), not the browser's online events.
        relayConfig: {
          ...(testRelays ? { urls: testRelays } : { redundancy: RELAY_REDUNDANCY }),
          manualReconnection: true,
          warnOnRelayFailure: false,
        },
        ...(testIceServers ? { rtcConfig: { iceServers: testIceServers } } : {}),
      },
      this.roomId,
      {
        onPeerHandshake: (peerId, send, receive) => (this.isHost
          ? this.#hostHandshake(peerId, send, receive)
          : this.#guestHandshake(peerId, send, receive)),
        onJoinError: (d) => {
          if (DIRECT_FAILED.test(d.error)) this.#onDirectFailed(d.peerId);
          else if (!/not-host/.test(d.error)) this.#emit('debug', d);
        },
        handshakeTimeoutMs: 15000,
      },
    );
    this.room = room;

    // Reconnection pausing is global to the page; a previous room may have paused it.
    trystero.resumeRelayReconnection?.();
    this.#discoverableSince = Date.now();
    this.#watchRelays();

    const ctl = room.makeAction<string>('ctl');
    const msg = room.makeAction<string>('msg');
    const file = room.makeAction<Uint8Array>('file');
    this.ctlAction = ctl;
    this.msgAction = msg;
    this.fileAction = file;
    // Incoming data is handled strictly in arrival order (e.g. 'welcome' before the first message).
    let inbox: Promise<void> = Promise.resolve();
    const queue = <T>(fn: (data: T, ctx: { peerId: string; metadata?: JsonValue }) => Promise<void>) =>
      (data: T, ctx: { peerId: string; metadata?: JsonValue }) => { inbox = inbox.then(() => fn(data, ctx)).catch(() => {}); };
    ctl.onMessage = queue<string>((data, ctx) => this.#onCtl(data, ctx));
    msg.onMessage = queue<string>((data, ctx) => this.#onMsg(data, ctx));
    file.onMessage = queue<Uint8Array>((data, ctx) => this.#onFile(data, ctx));
    // Membership is re-checked when the data is processed; here only the connection matters.
    file.onReceive = ({ peerId, byteLength }) => byteLength <= MAX_FILE_BYTES + 1024
      && (this.isHost ? this.guests.has(peerId) : peerId === this.hostPeerId);
    file.onReceiveProgress = (progress, { peerId, metadata }) => {
      if (!this.#trusted(peerId)) return;
      const key = isObj(metadata) && isStr(metadata.m) ? metadata.m : null;
      if (!key) return;
      void this.#readFileMeta(key).then((meta) => { if (meta) this.#emit('file-progress', { key, progress, ...meta }); });
    };
    room.onPeerJoin = (peerId) => { this.#onPeerJoin(peerId).catch(() => {}); };
    room.onPeerLeave = (peerId) => this.#onPeerLeave(peerId);
  }

  // ---- handshake ----
  async #hostHandshake(peerId: string, send: HandshakeSender, receive: HandshakeReceiver): Promise<void> {
    const nonce = C.randomId(16);
    await send({ v: 2, role: 'host', pub: this.identity.pub, nonce });
    const hello = parseHello((await receive()).data);
    if (hello?.role !== 'guest') throw new Error('protocol');
    await send({ sig: await C.sign(this.identity, `uss-host|${hello.nonce}|${nonce}`) });
    const answer = (await receive()).data;

    const deny = async (reason: DenyReason): Promise<never> => {
      await send({ ok: false, reason }).catch(() => {});
      throw new Error(reason);
    };
    if (this.locked || this.#banned.has(hello.pub)) return deny('locked');
    const nickRaw = hello.nick ?? '';
    const proof = isObj(answer) && isStr(answer.proof) ? answer.proof : '';
    const ok = await C.checkProof(this.#k.authKey, proof, 'uss-join', nonce, hello.nonce, hello.pub, nickRaw);
    if (!ok) {
      this.#failures++;
      this.#emit('auth-failed', { failures: this.#failures });
      if (this.#failures >= MAX_FAILURES) this.setLocked(true, true);
      return deny('passphrase');
    }
    const nick = cleanNick(nickRaw);
    if (!nick) return deny('nick');
    if (this.guests.size >= this.maxGuests) return deny('full');
    const lower = nick.toLowerCase();
    const taken = [...this.members.values(), ...this.guests.values()].some((m) => m.nick.toLowerCase() === lower);
    if (taken) return deny('nick-taken');

    const id = (await C.fingerprint(hello.pub)).slice(0, 16);
    this.#handshakes.set(peerId, { id, nick, pub: hello.pub });
    await send({ ok: true });
  }

  async #guestHandshake(peerId: string, send: HandshakeSender, receive: HandshakeReceiver): Promise<void> {
    const nonce = C.randomId(16);
    await send({ v: 2, role: 'guest', pub: this.identity.pub, nonce, nick: this.nick });
    const hello = parseHello((await receive()).data);
    if (hello?.role !== 'host') throw new Error('not-host');
    if (await C.fingerprint(hello.pub) !== this.hostFp) throw new Error('not-host');
    await send({ proof: await C.proof(this.#k.authKey, 'uss-join', hello.nonce, nonce, this.identity.pub, this.nick) });
    const sigMsg = (await receive()).data;
    const sig = isObj(sigMsg) && isStr(sigMsg.sig) ? sigMsg.sig : '';
    if (!await C.verify(hello.pub, `uss-host|${nonce}|${hello.nonce}`, sig)) throw new Error('not-host');
    const result = (await receive()).data;
    if (!isObj(result) || result.ok !== true) {
      const reason = isObj(result) && isStr(result.reason) ? result.reason : 'unknown';
      // Ignore redundant handshake attempts once we're already connected to the host.
      if (!this.hostPeerId && !this.closed) this.#emit('denied', { reason });
      throw new Error(reason);
    }
    this.hostPeerId = peerId;
    this.hostPub = hello.pub;
  }

  async #onPeerJoin(peerId: string): Promise<void> {
    const code = await C.safetyCode(this.room?.getPeers()[peerId]);
    if (this.isHost) {
      const info = this.#handshakes.get(peerId);
      this.#handshakes.delete(peerId);
      if (!info) return this.#drop(peerId);
      this.guests.set(peerId, { ...info, code, state: 'pending' });
      if (this.autoAccept || this.approved.get(info.pub) === info.nick) void this.accept(peerId);
      else this.#emit('request', { peerId, nick: info.nick, code });
      this.#syncDiscovery();
    } else if (peerId === this.hostPeerId) {
      this.hostCode = code;
      this.#emit('connected', { code });
    }
  }

  #onPeerLeave(peerId: string): void {
    if (this.isHost) {
      const g = this.guests.get(peerId);
      if (!g) return;
      this.guests.delete(peerId);
      if (g.state === 'member') {
        this.members.delete(g.id);
        void this.#broadcastRoster();
        this.#emit('left', { member: g });
      } else {
        this.#emit('request-cancelled', { peerId });
      }
      this.#syncDiscovery();
    } else if (peerId === this.hostPeerId && !this.closed) {
      // The host may just be reloading; keep listening and re-handshake when they're back.
      this.hostPeerId = null;
      this.accepted = false;
      this.#syncDiscovery();
      this.#emit('host-lost', {});
    }
  }

  #trusted(peerId: string): boolean {
    return this.isHost ? this.guests.get(peerId)?.state === 'member' : peerId === this.hostPeerId && this.accepted;
  }

  #memberPeers(except?: string): string[] {
    return [...this.guests].filter(([id, g]) => g.state === 'member' && id !== except).map(([id]) => id);
  }

  #drop(peerId: string): void {
    setTimeout(() => this.room?.getPeers()[peerId]?.close(), 400);
  }

  /**
   * Relays are only needed so that new peers can find the room. Once nobody new can (or needs
   * to) join, we disconnect from them: established WebRTC connections don't use the relays, and
   * staying connected would keep telling relay operators our IP address and that the room is
   * still alive.
   *   host:  discoverable while the room is open (not locked, not full)
   *   guest: discoverable only while looking for the host (before acceptance / after host loss)
   */
  #syncDiscovery(): void {
    const T = this.transport;
    if (!T?.getRelaySockets) return;
    const wanted = !this.closed && (this.isHost
      ? !this.locked && this.guests.size < this.maxGuests
      : !this.accepted);
    if (wanted === this.#discoverable) return;
    this.#discoverable = wanted;
    if (wanted) {
      T.resumeRelayReconnection();
      this.#discoverableSince = Date.now();
    } else {
      T.pauseRelayReconnection();
      const sockets = T.getRelaySockets() as Record<string, { close(): void } | undefined>;
      for (const socket of Object.values(sockets)) socket?.close();
    }
    this.#emit('discovery', { on: wanted });
  }

  // ---- network problems ----
  // A guest connects to the host only; a failed connection to another guest isn't worth a warning,
  // and once the host is found the warning no longer applies.
  #onDirectFailed(peerId: string): void {
    if (this.closed || (!this.isHost && this.hostPeerId)) return;
    this.#emit('direct-blocked', { peerId });
  }

  /**
   * Notices when no relay can be reached while the room needs them (see #syncDiscovery), e.g. a
   * network that blocks WebSockets to them. Sockets get RELAY_CHECK_MS to connect each time
   * discovery starts, so a relay that is still connecting doesn't count as blocked.
   */
  #watchRelays(): void {
    const T = this.transport;
    if (!T?.getRelaySockets) return;
    const check = () => {
      if (this.closed || !this.#discoverable || Date.now() - this.#discoverableSince < RELAY_CHECK_MS) return;
      const sockets = Object.values(T.getRelaySockets() as Record<string, { readyState: number } | undefined>);
      const reachable = sockets.some((s) => s?.readyState === 1);
      if (reachable === this.#relaysReachable) return;
      this.#relaysReachable = reachable;
      this.#emit('relays', { reachable });
    };
    clearInterval(this.#relayTimer);
    this.#relayTimer = setInterval(check, RELAY_CHECK_MS / 4);
  }

  // ---- host controls ----
  async accept(peerId: string): Promise<void> {
    const g = this.guests.get(peerId);
    if (!g || g.state !== 'pending') return;
    g.state = 'member';
    this.approved.set(g.pub, g.nick);
    this.#emit('persist', {});
    const member: Member = { id: g.id, nick: g.nick, pub: g.pub, host: false, peerId, code: g.code };
    this.members.set(g.id, member);
    await this.#sendCtl({ t: 'welcome', ...(this.expiresAt ? { ttl: Math.max(this.expiresAt - Date.now(), 1) } : {}) }, [peerId]);
    await this.#broadcastRoster();
    this.#emit('joined', { member });
  }

  async reject(peerId: string): Promise<void> {
    const g = this.guests.get(peerId);
    if (!g) return;
    this.guests.delete(peerId);
    this.#banned.add(g.pub);
    if (this.approved.delete(g.pub)) this.#emit('persist', {});
    await this.#sendCtl({ t: 'bye', reason: 'rejected' }, [peerId]).catch(() => {});
    this.#drop(peerId);
    this.#syncDiscovery();
  }

  async kick(memberId: string): Promise<void> {
    const m = this.members.get(memberId);
    if (!m || m.host || !m.peerId) return;
    this.#banned.add(m.pub);
    if (this.approved.delete(m.pub)) this.#emit('persist', {});
    await this.#sendCtl({ t: 'bye', reason: 'kicked' }, [m.peerId]).catch(() => {});
    this.guests.delete(m.peerId);
    this.members.delete(memberId);
    this.#drop(m.peerId);
    await this.#broadcastRoster();
    this.#syncDiscovery();
    this.#emit('left', { member: m, kicked: true });
  }

  setLocked(locked: boolean, auto = false): void {
    this.locked = locked;
    if (!locked) this.#failures = 0;
    this.#syncDiscovery();
    this.#emit('lock', { locked, auto });
  }

  async #broadcastRoster(): Promise<void> {
    const members = [...this.members.values()].map(({ id, nick, pub, host }) => ({ id, nick, pub, host }));
    this.#emit('roster', { members: [...this.members.values()] });
    const targets = this.#memberPeers();
    if (targets.length) await this.#sendCtl({ t: 'roster', members }, targets);
  }

  async #sendCtl(obj: Ctl, targets: string[]): Promise<void> {
    if (!targets.length || !this.ctlAction) return;
    await this.ctlAction.send(await C.sealJson(this.#k.groupKey, obj), { target: targets });
  }

  // ---- control messages (guest side) ----
  async #onCtl(data: string, { peerId }: { peerId: string }): Promise<void> {
    if (this.isHost || peerId !== this.hostPeerId || !isStr(data)) return;
    const msg = parseCtl(await C.openJson(this.#k.groupKey, data));
    if (!msg) return;
    if (msg.t === 'welcome') {
      // A guest also stops on its own at the end, e.g. while waiting for a host that never returns.
      if (msg.ttl && !this.expiresAt) { this.expiresAt = Date.now() + msg.ttl; this.#watchExpiry(); }
      this.accepted = true;
      this.#syncDiscovery();
      this.#emit('accepted', {});
    } else if (msg.t === 'roster') {
      const hostEntry = msg.members.find((m) => m.host);
      if (!hostEntry || hostEntry.pub !== this.hostPub) return;
      this.members = new Map(msg.members.map((m) => [m.id, m]));
      this.#emit('roster', { members: [...this.members.values()] });
    } else {
      this.#close(msg.reason);
    }
  }

  // ---- messages ----
  async #envelope(fields: { t: string; [field: string]: unknown }): Promise<{ inner: Inner; sealed: string }> {
    const inner: Inner = { ...fields, id: C.randomId(12), from: this.identity.id, ts: Date.now() };
    const d = JSON.stringify(inner);
    const envelope: Envelope = { d, s: await C.sign(this.identity, d) };
    return { inner, sealed: await C.sealJson(this.#k.groupKey, envelope) };
  }

  #targets(): string[] {
    if (this.isHost) return this.#memberPeers();
    return this.accepted && this.hostPeerId ? [this.hostPeerId] : [];
  }

  /** Sends a signed, encrypted message ({t: 'text', body} or any app-defined type). */
  async send(fields: { t: string; [field: string]: unknown }): Promise<Inner> {
    if (fields.t === 'text' && String(fields.body).length > MAX_TEXT) throw new Error('Message too long');
    const targets = this.#targets();
    if (!targets.length || !this.msgAction) throw new Error('Nobody to send to yet');
    const { inner, sealed } = await this.#envelope(fields);
    this.#seen.add(inner.id);
    await this.msgAction.send(sealed, { target: targets });
    return inner;
  }

  async #verifyEnvelope(sealed: string, peerId: string): Promise<{ inner: Inner; member: Member } | null> {
    const env = parseEnvelope(await C.openJson(this.#k.groupKey, sealed));
    const inner = env && parseInner(env.d);
    if (!env || !inner) return null;
    const member = this.members.get(inner.from);
    if (!member || !(await C.verify(member.pub, env.d, env.s))) return null;
    // The host only accepts a member's messages from that member's own connection.
    if (this.isHost && member.peerId !== peerId) return null;
    return { inner, member };
  }

  async #onMsg(data: string, { peerId }: { peerId: string }): Promise<void> {
    if (!this.#trusted(peerId) || !isStr(data)) return;
    const v = await this.#verifyEnvelope(data, peerId);
    if (!v || this.#seen.has(v.inner.id)) return;
    this.#seen.add(v.inner.id);
    if (this.isHost) {
      const others = this.#memberPeers(peerId);
      if (others.length) this.msgAction?.send(data, { target: others }).catch(() => {});
    }
    this.#emit('message', v);
  }

  // ---- files ----
  async sendFile(file: File, onProgress?: (progress: number) => void): Promise<Inner> {
    if (file.size > MAX_FILE_BYTES) throw new Error('File too large');
    const targets = this.#targets();
    if (!targets.length || !this.fileAction) throw new Error('Nobody to send to yet');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const hash = bytesToB64url(await C.sha256(bytes));
    const { inner, sealed: m } = await this.#envelope({ t: 'file', name: file.name, size: file.size, type: file.type, sha256: hash });
    this.#seen.add(inner.id);
    const data = await C.seal(this.#k.groupKey, bytes);
    await this.fileAction.send(data, { target: targets, metadata: { m }, onProgress: (p) => onProgress?.(p) });
    return inner;
  }

  #readFileMeta(m: string): Promise<FileMeta | null> {
    let pending = this.#fileMeta.get(m);
    if (!pending) {
      pending = (async (): Promise<FileMeta | null> => {
        const env = parseEnvelope(await C.openJson(this.#k.groupKey, m));
        const inner = env && parseInner(env.d);
        if (!env || !inner || !isFileInner(inner)) return null;
        const member = this.members.get(inner.from);
        if (!member || !(await C.verify(member.pub, env.d, env.s))) return null;
        return { inner, member };
      })().catch(() => null).then((meta) => {
        if (!meta) this.#fileMeta.delete(m); // may succeed later, once the roster arrives
        return meta;
      });
      this.#fileMeta.set(m, pending);
    }
    return pending;
  }

  async #onFile(data: Uint8Array, { peerId, metadata }: { peerId: string; metadata?: JsonValue }): Promise<void> {
    // Trystero delivers binary payloads as Uint8Array; anything else isn't a file.
    if (!this.#trusted(peerId) || !(data instanceof Uint8Array)) return;
    const key = isObj(metadata) && isStr(metadata.m) ? metadata.m : null;
    if (!key) return;
    const meta = await this.#readFileMeta(key);
    if (!meta || this.#seen.has(meta.inner.id)) return;
    if (this.isHost && meta.member.peerId !== peerId) return;
    const bytes = await C.open(this.#k.groupKey, data);
    if (bytes.length !== meta.inner.size || bytesToB64url(await C.sha256(bytes)) !== meta.inner.sha256) return;
    this.#seen.add(meta.inner.id);
    this.#fileMeta.delete(key);
    if (this.isHost) {
      const others = this.#memberPeers(peerId);
      if (others.length) this.fileAction?.send(data, { target: others, metadata: { m: key } }).catch(() => {});
    }
    this.#emit('file', { ...meta, key, blob: new Blob([bytes], { type: 'application/octet-stream' }) });
  }

  // ---- lifecycle ----
  // Checked against the clock rather than one long timer, which a sleeping device would delay.
  // The first check comes after a tick, once the caller has subscribed to 'expiring'.
  #watchExpiry(): void {
    const check = () => {
      if (this.closed || !this.expiresAt) return;
      const left = this.expiresAt - Date.now();
      if (left <= 0) { void this.#expire(); return; }
      if (left <= EXPIRY_WARNING_MS && !this.#warned) {
        this.#warned = true;
        this.#emit('expiring', { expiresAt: this.expiresAt });
      }
    };
    clearInterval(this.#expiryTimer);
    this.#expiryTimer = setInterval(check, 5000);
  }

  async #expire(): Promise<void> {
    if (this.closed) return;
    if (this.isHost) await this.#sendCtl({ t: 'bye', reason: 'expired' }, [...this.guests.keys()]).catch(() => {});
    this.#close('expired');
  }

  #close(reason: DenyReason | 'left'): void {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.#expiryTimer);
    clearInterval(this.#relayTimer);
    void this.room?.leave();
    this.#syncDiscovery();
    this.#emit('closed', { reason });
  }

  async leave(): Promise<void> {
    if (this.closed) return;
    if (this.isHost) {
      await this.#sendCtl({ t: 'bye', reason: 'closed' }, [...this.guests.keys()]).catch(() => {});
    }
    this.#close('left');
  }
}
