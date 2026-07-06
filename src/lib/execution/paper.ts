import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { positions, trades, botConfig } from "../../db/schema";
import type { ScoredOpportunity } from "../strategy/signals";
import type { NormalizedMarket } from "../polymarket/types";
import type { StrategyType } from "../strategy/learning";

export interface OpenPaperPositionParams {
  market: NormalizedMarket;
  opportunity: ScoredOpportunity;
  strategyType: StrategyType;
  sizeUsd: number;
  isExploration?: boolean;
}

/**
 * Opens a simulated position. For ARB_BOTH this buys equal share counts of
 * both YES and NO tokens (the only way the "guaranteed $1 payout" math
 * works), logging one trade row per leg. For directional bets it buys a
 * single side. Cash is debited immediately, same as a real fill would.
 */
export async function openPaperPosition(params: OpenPaperPositionParams) {
  const { market, opportunity, strategyType, sizeUsd, isExploration = false } = params;

  return db.transaction(async (tx) => {
    const cfgRows = await tx.select().from(botConfig).where(eq(botConfig.id, 1));
    const cfg = cfgRows[0];
    if (!cfg) throw new Error("bot_config row missing");
    if (cfg.paperCashUsd < sizeUsd) {
      throw new Error("insufficient paper cash");
    }

    let entryPrice: number;
    let size: number;

    if (opportunity.side === "ARB_BOTH") {
      const combined = market.yesPrice + market.noPrice;
      entryPrice = combined;
      size = sizeUsd / combined; // share-pairs
    } else {
      entryPrice = opportunity.side === "YES" ? market.yesPrice : market.noPrice;
      size = sizeUsd / entryPrice;
    }

    const [position] = await tx
      .insert(positions)
      .values({
        marketId: market.conditionId,
        outcome: opportunity.side,
        strategyType,
        category: market.category,
        isExploration,
        mode: "paper",
        status: "open",
        entryPrice,
        entryEdge: opportunity.edge,
        entryScore: opportunity.score,
        reasons: opportunity.reasons,
        size,
        costBasisUsd: sizeUsd,
      })
      .returning();

    if (opportunity.side === "ARB_BOTH") {
      await tx.insert(trades).values([
        {
          positionId: position.id,
          marketId: market.conditionId,
          outcome: "YES",
          action: "BUY",
          mode: "paper",
          price: market.yesPrice,
          size,
          valueUsd: size * market.yesPrice,
          reasons: opportunity.reasons,
        },
        {
          positionId: position.id,
          marketId: market.conditionId,
          outcome: "NO",
          action: "BUY",
          mode: "paper",
          price: market.noPrice,
          size,
          valueUsd: size * market.noPrice,
          reasons: opportunity.reasons,
        },
      ]);
    } else {
      await tx.insert(trades).values({
        positionId: position.id,
        marketId: market.conditionId,
        outcome: opportunity.side,
        action: "BUY",
        mode: "paper",
        price: entryPrice,
        size,
        valueUsd: sizeUsd,
        reasons: opportunity.reasons,
      });
    }

    await tx
      .update(botConfig)
      .set({ paperCashUsd: cfg.paperCashUsd - sizeUsd })
      .where(eq(botConfig.id, 1));

    return position;
  });
}

export async function closePaperPosition(
  positionId: number,
  exitPrice: number,
  reason: string
) {
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(positions).where(eq(positions.id, positionId));
    const position = rows[0];
    if (!position || position.status !== "open") return null;

    const proceeds = position.size * exitPrice;
    const realizedPnlUsd = proceeds - position.costBasisUsd;

    await tx
      .update(positions)
      .set({
        status: "closed",
        exitPrice,
        realizedPnlUsd,
        closeReason: reason,
        closedAt: new Date(),
      })
      .where(eq(positions.id, positionId));

    await tx.insert(trades).values({
      positionId: position.id,
      marketId: position.marketId,
      outcome: position.outcome === "ARB_BOTH" ? "BOTH" : position.outcome,
      action: "SELL",
      mode: "paper",
      price: exitPrice,
      size: position.size,
      valueUsd: proceeds,
      reasons: [reason],
    });

    const cfgRows = await tx.select().from(botConfig).where(eq(botConfig.id, 1));
    const cfg = cfgRows[0];
    if (cfg) {
      await tx
        .update(botConfig)
        .set({ paperCashUsd: cfg.paperCashUsd + proceeds })
        .where(eq(botConfig.id, 1));
    }

    return { position, realizedPnlUsd };
  });
}
