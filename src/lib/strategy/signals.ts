import type { NormalizedMarket } from "../polymarket/types";
import type { BotConfig } from "../../db/config";

export interface SnapshotPoint {
  timestamp: Date;
  yesPrice: number;
}

export interface MarketSignalInput {
  market: NormalizedMarket;
  history: SnapshotPoint[]; // ascending by time, most recent last
  yesBookImbalance?: number; // [-1, 1], positive = buy pressure
  noBookImbalance?: number;
}

export interface ScoredOpportunity {
  side: "YES" | "NO" | "ARB_BOTH";
  score: number;
  edge: number;
  reasons: string[];
}

/**
 * Pure scoring functions. Two distinct opportunity types are produced:
 *
 * 1. ARB_BOTH - yesPrice + noPrice < $1 by more than the min edge. Buying
 *    both legs locks in a payout of exactly $1 at resolution regardless of
 *    outcome, for less than $1 today. This is the only genuinely low-risk
 *    edge available on a binary market; everything else below is a
 *    heuristic directional bet and should be sized much smaller.
 * 2. Directional YES/NO - a momentum + order-book-imbalance heuristic. This
 *    is speculative: it has no claim to a true probability oracle, it just
 *    follows recent price/flow direction on liquid, sane-spread markets.
 */
export function scoreMarket(input: MarketSignalInput, config: BotConfig): ScoredOpportunity[] {
  const { market, history } = input;
  const opportunities: ScoredOpportunity[] = [];

  const combined = market.yesPrice + market.noPrice;
  const arbEdge = 1 - combined;
  if (arbEdge >= config.minEdgeThreshold) {
    opportunities.push({
      side: "ARB_BOTH",
      score: arbEdge * 100,
      edge: arbEdge,
      reasons: [
        `Yes (${market.yesPrice.toFixed(3)}) + No (${market.noPrice.toFixed(3)}) = ${combined.toFixed(3)}, ` +
          `locking in ${(arbEdge * 100).toFixed(1)}c of guaranteed profit per $1 payout if both legs fill`,
      ],
    });
  }

  const momentum = computeMomentum(history);
  if (momentum !== null) {
    const direction: "YES" | "NO" = momentum > 0 ? "YES" : "NO";
    const imbalance =
      direction === "YES" ? (input.yesBookImbalance ?? 0) : (input.noBookImbalance ?? 0);

    // Momentum alone is noisy; require the order book to at least not
    // contradict it, and require a minimum move to filter out flat/dead markets.
    const momentumMagnitude = Math.abs(momentum);
    if (momentumMagnitude >= 0.015) {
      const edge = clamp(momentumMagnitude * 0.5 + Math.max(imbalance, 0) * 0.05, 0, 0.25);
      if (edge >= config.minEdgeThreshold) {
        opportunities.push({
          side: direction,
          score: edge * 60 + momentumMagnitude * 20,
          edge,
          reasons: [
            `${direction} price momentum of ${(momentum * 100).toFixed(1)}c over recent snapshots`,
            imbalance !== 0
              ? `order book imbalance ${(imbalance * 100).toFixed(0)}% toward ${imbalance > 0 ? "bid" : "ask"}`
              : "no order book data",
          ],
        });
      }
    }
  }

  return opportunities;
}

/** Difference between latest yes price and the earliest price in the lookback window. */
function computeMomentum(history: SnapshotPoint[]): number | null {
  if (history.length < 3) return null;
  const first = history[0].yesPrice;
  const last = history[history.length - 1].yesPrice;
  return last - first;
}

export function passesLiquidityFilters(market: NormalizedMarket, config: BotConfig): boolean {
  if (market.liquidityUsd < config.minLiquidityUsd) return false;

  if (market.bestBid != null && market.bestAsk != null && market.bestAsk > 0) {
    const spreadPct = (market.bestAsk - market.bestBid) / market.bestAsk;
    if (spreadPct > config.maxSpreadPct) return false;
  }

  if (market.endDate) {
    const hoursToResolution = (market.endDate.getTime() - Date.now()) / 3_600_000;
    if (hoursToResolution < config.minHoursToResolution) return false;
    if (hoursToResolution > config.maxDaysToResolution * 24) return false;
  }

  return true;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
