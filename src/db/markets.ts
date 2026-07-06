import { sql } from "drizzle-orm";
import { db } from "./client";
import { markets, marketSnapshots } from "./schema";
import type { NormalizedMarket } from "../lib/polymarket/types";

/** Upserts market metadata and appends one price snapshot per market, chunked
 * into batched round-trips so scanning hundreds of markets stays fast. */
export async function upsertMarketsAndSnapshots(list: NormalizedMarket[]) {
  const CHUNK = 40;
  const now = new Date();

  for (let i = 0; i < list.length; i += CHUNK) {
    const chunk = list.slice(i, i + CHUNK);
    const statements = chunk.flatMap((m) => [
      db
        .insert(markets)
        .values({
          id: m.conditionId,
          slug: m.slug,
          question: m.question,
          category: m.category,
          yesTokenId: m.yesTokenId,
          noTokenId: m.noTokenId,
          endDate: m.endDate,
          active: m.active,
          closed: m.closed,
          lastSyncedAt: now,
        })
        .onConflictDoUpdate({
          target: markets.id,
          set: {
            question: m.question,
            category: m.category,
            active: m.active,
            closed: m.closed,
            endDate: m.endDate,
            lastSyncedAt: now,
          },
        }),
      db.insert(marketSnapshots).values({
        marketId: m.conditionId,
        timestamp: now,
        yesPrice: m.yesPrice,
        noPrice: m.noPrice,
        bestBid: m.bestBid,
        bestAsk: m.bestAsk,
        spreadPct: m.spreadPct,
        liquidityUsd: m.liquidityUsd,
        volume24hrUsd: m.volume24hrUsd,
      }),
    ]);

    if (statements.length > 0) {
      await db.batch(statements as [(typeof statements)[number], ...(typeof statements)[number][]]);
    }
  }
}

/** Last N snapshot yes-prices per market, ascending by time, for momentum calc. */
export async function getRecentSnapshotHistory(
  marketIds: string[],
  perMarketLimit = 6
): Promise<Map<string, { timestamp: Date; yesPrice: number }[]>> {
  const result = new Map<string, { timestamp: Date; yesPrice: number }[]>();
  if (marketIds.length === 0) return result;

  const rows = await db
    .select({
      marketId: marketSnapshots.marketId,
      timestamp: marketSnapshots.timestamp,
      yesPrice: marketSnapshots.yesPrice,
    })
    .from(marketSnapshots)
    .where(sql`${marketSnapshots.marketId} in ${marketIds}`)
    .orderBy(marketSnapshots.timestamp);

  for (const row of rows) {
    const list = result.get(row.marketId) ?? [];
    list.push({ timestamp: row.timestamp, yesPrice: row.yesPrice });
    result.set(row.marketId, list);
  }

  for (const [id, list] of result) {
    result.set(id, list.slice(-perMarketLimit));
  }

  return result;
}
