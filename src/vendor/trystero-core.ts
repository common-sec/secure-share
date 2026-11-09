// Trystero's core (@trystero-p2p/core, MIT, https://github.com/dmotz/trystero): WebRTC peers, data
// channels, actions and the strategy helpers our Symbolon strategy is built on. The one module that
// imports it, so the unit tests can load it as a single file (build.mjs bundles this module alone
// into build/modules/); the site's build bundles it into the strategy's chunk as usual.
export {
  createRelayManager, createTopicStrategy, getRelays, makeSocket, pauseRelayReconnection, resumeRelayReconnection,
} from '@trystero-p2p/core';
export type {
  JoinRoomCallbacks, JoinRoomConfig, Room, SocketClient, StrategyMessage,
} from '@trystero-p2p/core';
