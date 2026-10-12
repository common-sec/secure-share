// In-memory stand-in for the subset of Trystero's API that SecureRoom uses, so the room protocol
// can be tested offline, deterministically, and with adversarial peers.
//
//   const net = new FakeNetwork();
//   const transport = net.transport();          // one per simulated browser
//   SecureRoom.host({ ..., transport });
//
// Semantics mirrored from Trystero:
//   - peers find each other only if appId, roomId and the signaling password all match, and only
//     while their relay connection is up (not paused)
//   - onPeerHandshake runs on both sides before a peer becomes active; if either side throws,
//     the pair never connects
//   - actions deliver in order per pair; binary data (ArrayBuffer or any view) arrives as a fresh
//     Uint8Array, as Trystero delivers it
//   - closing a peer connection fires onPeerLeave on both ends
let counter = 0;

function randomHex(bytes) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join(':');
}

function clone(data) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data.slice(0));
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  if (data && typeof data === 'object') return structuredClone(data);
  return data;
}

const byteLength = (data) => (data instanceof ArrayBuffer || ArrayBuffer.isView(data) ? data.byteLength : 0);

export class FakeNetwork {
  constructor() {
    this.endpoints = new Set();
    this.log = []; // every handshake outcome, for assertions
  }

  transport() {
    return new FakeTransport(this);
  }

  #key(ep) {
    return `${ep.config.appId}|${ep.roomId}|${ep.config.password}`;
  }

  discover(ep) {
    if (!ep.online()) return;
    for (const other of this.endpoints) {
      if (other === ep || !other.online() || this.#key(other) !== this.#key(ep)) continue;
      if (ep.peers.has(other.id) || ep.pending.has(other.id)) continue;
      this.#handshake(ep, other);
    }
  }

  async #handshake(a, b) {
    a.pending.add(b.id);
    b.pending.add(a.id);
    const ab = channel();
    const ba = channel();
    const fail = (err) => { ab.abort(err); ba.abort(err); };
    const run = async (self, peer, send, recv, initiator) => {
      try {
        await self.callbacks?.onPeerHandshake?.(peer.id, send, recv, initiator);
      } catch (err) {
        fail(err);
        throw err;
      }
    };
    const results = await Promise.allSettled([
      run(a, b, (data, metadata) => ab.push({ data: clone(data), metadata }), () => ba.pull(), true),
      run(b, a, (data, metadata) => ba.push({ data: clone(data), metadata }), () => ab.pull(), false),
    ]);
    a.pending.delete(b.id);
    b.pending.delete(a.id);
    const ok = results.every((r) => r.status === 'fulfilled');
    this.log.push({ a: a.id, b: b.id, ok, errors: results.map((r) => r.reason?.message ?? null) });
    if (!ok) {
      results.forEach((r, i) => {
        const self = i === 0 ? a : b;
        if (r.status === 'rejected') self.callbacks?.onJoinError?.({ error: String(r.reason?.message), peerId: (i === 0 ? b : a).id });
      });
      return;
    }
    if (a.left || b.left) return;
    a.peers.set(b.id, peerConnection(this, a, b));
    b.peers.set(a.id, peerConnection(this, b, a));
    a.api.onPeerJoin?.(b.id);
    b.api.onPeerJoin?.(a.id);
  }

  disconnect(a, b) {
    const had = a.peers.delete(b.id) | b.peers.delete(a.id);
    if (!had) return;
    setTimeout(() => { a.api.onPeerLeave?.(b.id); b.api.onPeerLeave?.(a.id); }, 0);
  }

  deliver(from, to, ns, data, metadata) {
    // One ordered queue per direction, across all actions (like a single data channel).
    const key = `${from.id}>${to.id}`;
    const prev = from.queues.get(key) ?? Promise.resolve();
    const next = prev.then(() => new Promise((r) => setTimeout(r, 0))).then(async () => {
      if (!to.peers.has(from.id)) return;
      const action = to.actions.get(ns);
      if (!action) return;
      const size = byteLength(data);
      if (size > 0 && action.onReceive) {
        const accepted = await action.onReceive({ peerId: from.id, byteLength: size, metadata, kind: 'message', signal: new AbortController().signal });
        if (!accepted) return;
      }
      if (size > 0) action.onReceiveProgress?.(1, { peerId: from.id, metadata });
      await action.onMessage?.(clone(data), { peerId: from.id, metadata });
    });
    from.queues.set(key, next.catch(() => {}));
    return next;
  }
}

function channel() {
  const queue = [];
  const waiters = [];
  let aborted = null;
  return {
    push(v) { if (aborted) return Promise.reject(aborted); waiters.length ? waiters.shift().resolve(v) : queue.push(v); return Promise.resolve(); },
    pull() {
      if (queue.length) return Promise.resolve(queue.shift());
      if (aborted) return Promise.reject(aborted);
      return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
    },
    abort(err) { aborted = err; while (waiters.length) waiters.shift().reject(err); },
  };
}

function peerConnection(net, self, peer) {
  return {
    localDescription: { sdp: `v=0\r\na=fingerprint:sha-256 ${self.fingerprint}\r\n` },
    remoteDescription: { sdp: `v=0\r\na=fingerprint:sha-256 ${peer.fingerprint}\r\n` },
    close: () => net.disconnect(self, peer),
  };
}

class FakeTransport {
  constructor(net) {
    this.net = net;
    this.paused = false;
    this.pauseCount = 0;
    this.socket = { readyState: 1, close: () => { this.socket.readyState = 3; } };
    this.endpoint = null;
  }

  getRelaySockets() { return { 'wss://relay.test': this.socket }; }

  pauseRelayReconnection() { this.paused = true; this.pauseCount++; }

  resumeRelayReconnection() {
    if (!this.paused && this.socket.readyState === 1) return; // already connected: nothing to resume
    this.paused = false;
    this.socket.readyState = 1;
    if (this.endpoint && !this.endpoint.left) this.net.discover(this.endpoint);
  }

  joinRoom(config, roomId, callbacks) {
    const ep = new Endpoint(this, config, roomId, callbacks);
    this.endpoint = ep;
    this.net.endpoints.add(ep);
    setTimeout(() => this.net.discover(ep), 0);
    return ep.api;
  }
}

class Endpoint {
  constructor(transport, config, roomId, callbacks) {
    Object.assign(this, { transport, config, roomId, callbacks });
    this.id = `peer-${++counter}`;
    this.fingerprint = randomHex(32);
    this.peers = new Map();
    this.pending = new Set();
    this.actions = new Map();
    this.queues = new Map();
    this.left = false;
    const net = transport.net;
    const ep = this;
    this.api = {
      onPeerJoin: null,
      onPeerLeave: null,
      getPeers: () => Object.fromEntries(ep.peers),
      makeAction(ns) {
        const action = {
          onMessage: null, onReceive: null, onReceiveProgress: null,
          async send(data, { target = null, metadata, onProgress } = {}) {
            const ids = target == null ? [...ep.peers.keys()] : [].concat(target);
            await Promise.all(ids.map(async (id) => {
              const peer = [...net.endpoints].find((e) => e.id === id);
              if (!peer || !ep.peers.has(id)) return;
              await net.deliver(ep, peer, ns, data, metadata);
              onProgress?.(1, { peerId: id });
            }));
          },
        };
        ep.actions.set(ns, action);
        return action;
      },
      async leave() {
        ep.left = true;
        for (const id of [...ep.peers.keys()]) {
          const peer = [...net.endpoints].find((e) => e.id === id);
          if (peer) net.disconnect(ep, peer);
        }
        net.endpoints.delete(ep);
      },
    };
  }

  online() {
    return !this.left && !this.transport.paused && this.transport.socket.readyState === 1;
  }
}
