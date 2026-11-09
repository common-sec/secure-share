// Trystero's discovery over Nostr relays, with Symbolon doing the security-sensitive parts.
//
// Trystero is two layers: a core (WebRTC peers, data channels, actions, the onPeerHandshake hook,
// offer encryption with the room password) and a "strategy" that carries the core's signalling
// messages over some network. We keep Trystero's core and replace its Nostr strategy with this
// one, built on Symbolon (https://github.com/common-sec/symbolon, also used by gum0x/bringmeback):
//
//   topics   Trystero's topic names are hashes of the app id and room id. Here each one becomes
//            Symbolon's keyed topic, HKDF of the link secret (GroupKeys.topic), so a relay can't
//            compute a room's topic from its id or link it to another room.
//   content  every message is sealed with Symbolon (XChaCha20-Poly1305 with the room's seal key),
//            bound to its topic and creation time: a relay can't read it, move it to another topic
//            or replay it outside a two-minute window. Inside, Trystero's own AES-GCM encryption of
//            offers and answers is unchanged.
//   events   ephemeral kind 21059 events (relays don't store them; NIP-40 expiration for those
//            that do), built and BIP-340 signed by Symbolon with a key made for this page only.
//
// The keys come from the link secret alone, never the passphrase (DECISIONS D9). Everything a
// relay sends is untrusted: anything that doesn't parse, isn't fresh or doesn't open is dropped.
import {
  createRelayManager, createTopicStrategy, getRelays, makeSocket, pauseRelayReconnection, resumeRelayReconnection,
  type JoinRoomCallbacks, type JoinRoomConfig, type Room, type SocketClient, type StrategyMessage,
} from '@trystero-p2p/core';
import { loadSymbolon, type EventSigner, type GroupKeys, type Symbolon } from '../vendor/symbolon.js';
import { utf8 } from './encoding.js';
import { openEvent, parseEvent, relayTopic, sealEvent, toHex, unixNow } from './relay-seal.js';

const SEEN_LIMIT = 1024;

/**
 * Public relays, the ones gum0x/bringmeback uses. Any one of them is enough; all three are used,
 * so that two peers likely share one that is up.
 */
export const DEFAULT_RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'];

export interface SymbolonRoomConfig extends JoinRoomConfig {
  /** the room's signalling keys: Symbolon, from the link secret only */
  signaling: { context: string; secret: Uint8Array };
}

export interface Trystero {
  joinRoom(config: SymbolonRoomConfig, roomId: string, callbacks?: JoinRoomCallbacks): Room;
  getRelaySockets(): Record<string, WebSocket>;
  pauseRelayReconnection(): void;
  resumeRelayReconnection(): void;
}

interface Subscription {
  /** Trystero's name for the topic, which its handler expects back */
  topic: string;
  keys: GroupKeys;
  bytes: Uint8Array;
  handler: (topic: string, msg: StrategyMessage) => void;
}

export function createSymbolonStrategy(sym: Symbolon, connect: typeof makeSocket = makeSocket): Trystero {
  // One throwaway signing key per page, like Trystero's own Nostr strategy: relays can't link
  // this page's events to any other run.
  const signer: EventSigner = sym.EventSigner.generate();
  const relays = createRelayManager((client: SocketClient) => client.socket);
  /** room keys by "<appId>|<roomId>", registered by joinRoom below */
  const roomKeys = new Map<string, { keys: GroupKeys; refs: number }>();
  /** per relay: subscriptions by Symbolon topic (hex), and their subscription ids */
  const subs = new Map<string, Map<string, Subscription & { subId: string }>>();
  /** per relay: the last announcement on each topic, published again after a reconnect */
  const announcements = new Map<string, Map<string, string>>();
  const seen = new Set<string>();

  const keysFor = (appId: string, roomId: string): GroupKeys => {
    const entry = roomKeys.get(`${appId}|${roomId}`);
    if (!entry) throw new Error('no signalling keys for this room');
    return entry.keys;
  };

  const subscribe = (client: SocketClient, sub: Subscription & { subId: string }) => {
    client.send(`["REQ",${JSON.stringify(sub.subId)},${sym.signalFilter(sub.bytes, unixNow())}]`);
  };

  const publish = (client: SocketClient, keys: GroupKeys, topic: string, payload: string): void => {
    if (client.isClosed || client.socket?.readyState !== 1) return;
    client.send(sealEvent(signer, keys, topic, payload));
  };

  const receive = (client: SocketClient, data: string): void => {
    const event = parseEvent(data);
    const sub = event && subs.get(client.url)?.get(event.topicHex);
    if (!event || !sub || sub.subId !== event.subId) return;
    // The same event arrives once from every relay.
    if (seen.has(event.id)) return;
    const payload = openEvent(sub.keys, event);
    if (payload === null) return;
    seen.add(event.id);
    if (seen.size > SEEN_LIMIT) seen.delete(seen.values().next().value!);
    sub.handler(sub.topic, payload);
  };

  const joinInner = createTopicStrategy<SocketClient, JoinRoomConfig>({
    init: (config) => getRelays(config, DEFAULT_RELAYS, DEFAULT_RELAYS.length).map((url) => {
      const client: SocketClient = relays.register(url, () => connect(url, (data) => receive(client, data), () => {
        // Back after a drop: subscribe again, and announce again so peers can find us.
        for (const sub of subs.get(client.url)?.values() ?? []) subscribe(client, sub);
        for (const [topic, payload] of announcements.get(client.url) ?? []) {
          const sub = [...(subs.get(client.url)?.values() ?? [])].find((s) => s.topic === topic);
          if (sub) publish(client, sub.keys, topic, payload);
        }
      }));
      return client.ready;
    }),
    subscribeTopic: (client, topic, onMessage, ctx) => {
      const keys = keysFor(ctx.appId, ctx.roomId);
      const { bytes, hex: topicHex } = relayTopic(keys, topic);
      const sub = { topic, keys, bytes, handler: (t: string, m: StrategyMessage) => void onMessage(t, m), subId: toHex(crypto.getRandomValues(new Uint8Array(16))) };
      let forRelay = subs.get(client.url);
      if (!forRelay) subs.set(client.url, forRelay = new Map());
      forRelay.set(topicHex, sub);
      subscribe(client, sub);
      return () => {
        if (subs.get(client.url)?.get(topicHex) !== sub) return;
        subs.get(client.url)?.delete(topicHex);
        client.send(JSON.stringify(['CLOSE', sub.subId]));
      };
    },
    publishTopic: (client, topic, msg, ctx) => {
      const payload = typeof msg === 'string' ? msg : JSON.stringify(msg);
      if (ctx.kind === 'announce') {
        let forRelay = announcements.get(client.url);
        if (!forRelay) announcements.set(client.url, forRelay = new Map());
        forRelay.set(topic, payload);
      }
      publish(client, keysFor(ctx.appId, ctx.roomId), topic, payload);
    },
    unpublishTopic: (client, topic) => {
      announcements.get(client.url)?.delete(topic);
    },
  });

  return {
    joinRoom(config, roomId, callbacks) {
      const { signaling, ...rest } = config;
      const id = `${config.appId}|${roomId}`;
      const entry = roomKeys.get(id);
      if (entry) entry.refs++;
      else roomKeys.set(id, { keys: new sym.GroupKeys(utf8.encode(signaling.context), signaling.secret), refs: 1 });
      const room = joinInner(rest, roomId, callbacks);
      const leave = room.leave.bind(room);
      room.leave = async () => {
        await leave();
        const e = roomKeys.get(id);
        // Not freed here: Trystero may still be tearing the room down. wasm-bindgen frees it once unused.
        if (e && --e.refs === 0) roomKeys.delete(id);
      };
      return room;
    },
    getRelaySockets: () => relays.getSockets() as Record<string, WebSocket>,
    pauseRelayReconnection,
    resumeRelayReconnection,
  };
}

let trystero: Promise<Trystero> | null = null;

/** Trystero's core with the Symbolon strategy, made once per page (relays are shared). */
export function load(): Promise<Trystero> {
  trystero ??= loadSymbolon().then((sym) => createSymbolonStrategy(sym)).catch((err: unknown) => { trystero = null; throw err; });
  return trystero;
}
