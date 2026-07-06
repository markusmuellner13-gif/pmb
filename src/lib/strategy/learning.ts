import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../../db/client";
import { positions } from "../../db/schema";

export type StrategyType = "ARBITRAGE" | "MOMENTUM";

export interface StrategyPerformance {
  sampleSize: number;
  winRate: number | null;
  avgReturnPct: number | null;
  /** Multiplier applied to position sizing for this strategy going forward. */
  confidenceMultiplier: number;
}

export const MIN_SAMPLES_FOR_ADJUSTMENT = 10;

/**
 * The bot's "memory": looks at every closed paper (or live) position for a
 * strategy type -- optionally narrowed to one category -- and turns the
 * realized track record into a sizing multiplier for future trades. With
 * fewer than MIN_SAMPLES_FOR_ADJUSTMENT closed trades it stays neutral (1x)
 * -- there isn't enough signal yet to trust a skew either way. Deliberately
 * simple (win rate + average return, not a fitted model) so its behavior
 * stays auditable from the trades table alone.
 */
export async function getStrategyPerformance(
  strategyType: StrategyType,
  mode: "paper" | "live",
  category?: string | null
): Promise<StrategyPerformance> {
  const conditions = [
    eq(positions.strategyType, strategyType),
    eq(positions.mode, mode),
    eq(positions.status, "closed"),
    isNotNull(positions.realizedPnlUsd),
  ];
  if (category) conditions.push(eq(positions.category, category));

  const closed = await db
    .select({
      costBasisUsd: positions.costBasisUsd,
      realizedPnlUsd: positions.realizedPnlUsd,
    })
    .from(positions)
    .where(and(...conditions));

  return summarize(closed);
}

/**
 * Per-category track record across every strategy, used to drive the
 * dashboard's "what's working" view and to spot categories worth exploring
 * further vs. ones that should be sized down.
 */
export interface CategoryPerformance extends StrategyPerformance {
  category: string;
}

export async function getCategoryBreakdown(mode: "paper" | "live"): Promise<CategoryPerformance[]> {
  const closed = await db
    .select({
      category: positions.category,
      costBasisUsd: positions.costBasisUsd,
      realizedPnlUsd: positions.realizedPnlUsd,
    })
    .from(positions)
    .where(
      and(eq(positions.mode, mode), eq(positions.status, "closed"), isNotNull(positions.realizedPnlUsd))
    );

  const byCategory = new Map<string, typeof closed>();
  for (const row of closed) {
    const key = row.category ?? "Uncategorized";
    const list = byCategory.get(key) ?? [];
    list.push(row);
    byCategory.set(key, list);
  }

  return [...byCategory.entries()]
    .map(([category, rows]) => ({ category, ...summarize(rows) }))
    .sort((a, b) => b.sampleSize - a.sampleSize);
}

/**
 * Combines a strategy-level and category-level read into one sizing
 * multiplier, preferring the category-specific number once it has enough
 * samples to trust, and falling back to the broader strategy-level number
 * (then to neutral) otherwise -- so the bot's sizing gets more precise
 * about "momentum bets on Politics markets" as it accumulates history,
 * without waiting for that narrow slice alone to reach the sample minimum.
 */
export function resolveConfidence(
  strategyPerf: StrategyPerformance,
  categoryPerf: StrategyPerformance | null
): number {
  if (categoryPerf && categoryPerf.sampleSize >= MIN_SAMPLES_FOR_ADJUSTMENT) {
    return categoryPerf.confidenceMultiplier;
  }
  return strategyPerf.confidenceMultiplier;
}

function summarize(closed: { costBasisUsd: number; realizedPnlUsd: number | null }[]): StrategyPerformance {
  const sampleSize = closed.length;
  if (sampleSize === 0) {
    return { sampleSize, winRate: null, avgReturnPct: null, confidenceMultiplier: 1 };
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

  return { sampleSize, winRate, avgReturnPct, confidenceMultiplier };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
