// How the Symbolon strategy treats a relay that pushes back, ported from Trystero's own Nostr
// strategy (@trystero-p2p/nostr 0.26.0, backoffRelay/retireRelay), so we don't keep hammering a
// relay that has asked us to slow down or told us we aren't welcome (dmotz/trystero#192):
//
//   rate-limited   an `OK false` or `CLOSED` reply whose reason starts with "rate-limited:".
//                  Nothing is published to that relay, and nothing resubscribed, for 60 s; each
//                  further rate limit doubles the pause, up to 15 min. An accepted event after the
//                  pause ends resets it.
//   terminal       a reason starting with "blocked:", "restricted:", "auth-required:" or "pow:".
//                  The relay is retired: its socket is closed and not reopened for this page.
//   closed         any other `CLOSED` subscription is requested again, after 5.3 s, doubling up
//                  to 60 s while the relay keeps closing it (an EOSE resets that), and never
//                  before a rate-limit pause ends.
//
// Pure bookkeeping, no sockets: src/lib/symbolon-nostr.ts acts on what this returns.

export const STEADY_ANNOUNCE_MS = 60_000;
export const MAX_BACKOFF_MS = 900_000;
export const RESUBSCRIBE_MS = 5_333;

const TERMINAL = /^(blocked|restricted|auth-required|pow):/;

/** A relay's reply other than an EVENT: NIP-01's OK, CLOSED and EOSE. */
export type RelayReply =
  | { type: 'OK'; accepted: boolean; reason: string }
  | { type: 'CLOSED'; subId: string; reason: string }
  | { type: 'EOSE'; subId: string };

/** Reads an OK, CLOSED or EOSE message; null for anything else (an EVENT, a NOTICE, junk). */
export function parseReply(data: string): RelayReply | null {
  let msg: unknown;
  try { msg = JSON.parse(data); } catch { return null; }
  if (!Array.isArray(msg)) return null;
  const [type, a, b, c] = msg as unknown[];
  const text = (v: unknown) => (typeof v === 'string' ? v : '');
  if (type === 'OK' && typeof b === 'boolean') return { type, accepted: b, reason: text(c) };
  if (type === 'CLOSED' && typeof a === 'string') return { type, subId: a, reason: text(b) };
  if (type === 'EOSE' && typeof a === 'string') return { type, subId: a };
  return null;
}

/** What the strategy should do about a reply. */
export interface Verdict {
  /** close this relay for good */
  retire?: true;
  /** request this subscription again after this many ms */
  resubscribe?: { subId: string; inMs: number };
}

export class RelayHealth {
  private readonly backoffs = new Map<string, { delayMs: number; untilMs: number }>();
  private readonly resubscribeMs = new Map<string, number>();
  private readonly retired = new Set<string>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  isRetired(url: string): boolean {
    return this.retired.has(url);
  }

  /** How long this relay is still paused for (0: not paused). */
  backoffMs(url: string): number {
    const state = this.backoffs.get(url);
    return state ? Math.max(0, state.untilMs - this.now()) : 0;
  }

  onReply(url: string, reply: RelayReply | null): Verdict {
    if (!reply || this.retired.has(url)) return {};
    if (reply.type === 'EOSE') {
      this.resubscribeMs.delete(url);
      return {};
    }
    if (reply.type === 'OK' && reply.accepted) {
      if (this.backoffMs(url) === 0) this.backoffs.delete(url);
      return {};
    }
    if (TERMINAL.test(reply.reason)) {
      this.retired.add(url);
      this.backoffs.delete(url);
      this.resubscribeMs.delete(url);
      return { retire: true };
    }
    const rateLimited = reply.reason.startsWith('rate-limited:');
    if (rateLimited) this.backOff(url);
    if (reply.type !== 'CLOSED') return {};
    const retry = this.resubscribeMs.get(url) ?? RESUBSCRIBE_MS;
    this.resubscribeMs.set(url, Math.min(retry * 2, STEADY_ANNOUNCE_MS));
    return { resubscribe: { subId: reply.subId, inMs: Math.max(retry, this.backoffMs(url)) } };
  }

  private backOff(url: string): void {
    const previous = this.backoffs.get(url)?.delayMs;
    const delayMs = Math.min(previous ? Math.max(STEADY_ANNOUNCE_MS, previous * 2) : STEADY_ANNOUNCE_MS, MAX_BACKOFF_MS);
    this.backoffs.set(url, { delayMs, untilMs: this.now() + delayMs });
  }
}
