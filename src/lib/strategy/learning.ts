import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../../db/client";
import { positions } from "../../db/schema";

export type StrategyType = "ARBITRAGE" | "MOMENTUM";

export interface StrategyPerformance {
  strategyType: StrategyType;
  sampleSize: number;
  winRate: number | null;
  avgReturnPct: number | null;
  /** Multiplier applied to position sizing for this strategy going forward. */
  confidenceMultiplier: number;
}

const MIN_SAMPLES_FOR_ADJUSTMENT = 10;

/**
 * The bot's "memory": looks at every closed paper (or live) position for a
 * strategy type and turns the realized track record into a sizing
 * multiplier for future trades of that type. With fewer than
 * MIN_SAMPLES_FOR_ADJUSTMENT closed trades it stays neutral (1x) -- there
 * isn't enough signal yet to trust a skew either way. This is deliberately
 * simple (win rate + average return, not a fitted model) so its behavior
 * stays auditable from the trades table alone.
 */
export async function getStrategyPerformance(
  strategyType: StrategyType,
  mode: "paper" | "live"
): Promise<StrategyPerformance> {
  const closed = await db
    .select({
      costBasisUsd: positions.costBasisUsd,
      realizedPnlUsd: positions.realizedPnlUsd,
    })
    .from(positions)
    .where(
      and(
        eq(positions.strategyType, strategyType),
        eq(positions.mode, mode),
        eq(positions.status, "closed"),
        isNotNull(positions.realizedPnlUsd)
      )
    );

  const sampleSize = closed.length;
  if (sampleSize === 0) {
    return { strategyType, sampleSize, winRate: null, avgReturnPct: null, confidenceMultiplier: 1 };
  }

  const wins = closed.filter((p) => (p.realizedPnlUsd ?? 0) > 0).length;
  const winRate = wins / sampleSize;
  const avgReturnPct =
    closed.reduce((sum, p) => sum + (p.realizedPnlUsd ?? 0) / p.costBasisUsd, 0) / sampleSize;

  let confidenceMultiplier = 1;
  if (sampleSize >= MIN_SAMPLES_FOR_ADJUSTMENT) {
    // Shrink toward 1x when the track record is thin/mixed, lean in when it's
    // clearly good, cut hard when it's clearly bad. Clamped to [0.25x, 1.5x].
    const skew = (winRate - 0.5) * 2 + avgReturnPct * 3;
    confidenceMultiplier = clamp(1 + skew, 0.25, 1.5);
  }

  return { strategyType, sampleSize, winRate, avgReturnPct, confidenceMultiplier };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
