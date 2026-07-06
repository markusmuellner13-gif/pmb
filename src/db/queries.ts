import { desc, eq, and } from "drizzle-orm";
import { db } from "./client";
import {
  equityCurve,
  positions,
  trades,
  opportunities,
  cycleLogs,
  markets,
} from "./schema";
import { getBotConfig } from "./config";

export async function getEquityCurve(mode: "paper" | "live", limit = 500) {
  const rows = await db
    .select()
    .from(equityCurve)
    .where(eq(equityCurve.mode, mode))
    .orderBy(desc(equityCurve.timestamp))
    .limit(limit);
  return rows.reverse();
}

export async function getOpenPositions(mode: "paper" | "live") {
  return db
    .select({
      position: positions,
      market: markets,
    })
    .from(positions)
    .innerJoin(markets, eq(positions.marketId, markets.id))
    .where(and(eq(positions.status, "open"), eq(positions.mode, mode)))
    .orderBy(desc(positions.openedAt));
}

export async function getClosedPositions(mode: "paper" | "live", limit = 100) {
  return db
    .select({
      position: positions,
      market: markets,
    })
    .from(positions)
    .innerJoin(markets, eq(positions.marketId, markets.id))
    .where(and(eq(positions.status, "closed"), eq(positions.mode, mode)))
    .orderBy(desc(positions.closedAt))
    .limit(limit);
}

export async function getRecentTrades(mode: "paper" | "live", limit = 100) {
  return db
    .select({ trade: trades, market: markets })
    .from(trades)
    .innerJoin(markets, eq(trades.marketId, markets.id))
    .where(eq(trades.mode, mode))
    .orderBy(desc(trades.createdAt))
    .limit(limit);
}

export async function getRecentOpportunities(limit = 60) {
  return db
    .select({ opportunity: opportunities, market: markets })
    .from(opportunities)
    .innerJoin(markets, eq(opportunities.marketId, markets.id))
    .orderBy(desc(opportunities.timestamp))
    .limit(limit);
}

export async function getRecentCycleLogs(limit = 20) {
  return db.select().from(cycleLogs).orderBy(desc(cycleLogs.startedAt)).limit(limit);
}

export interface OverviewStats {
  totalEquityUsd: number;
  startingBankrollUsd: number;
  totalPnlUsd: number;
  totalPnlPct: number;
  todayPnlUsd: number;
  openPositionCount: number;
  openExposureUsd: number;
  winRate: number | null;
  closedTradeCount: number;
}

export async function getOverviewStats(mode: "paper" | "live"): Promise<OverviewStats> {
  const [latestEquity] = await db
    .select()
    .from(equityCurve)
    .where(eq(equityCurve.mode, mode))
    .orderBy(desc(equityCurve.timestamp))
    .limit(1);

  const open = await db
    .select()
    .from(positions)
    .where(and(eq(positions.status, "open"), eq(positions.mode, mode)));

  const closed = await db
    .select()
    .from(positions)
    .where(and(eq(positions.status, "closed"), eq(positions.mode, mode)));

  const config = await getBotConfig();
  const startingBankrollUsd = config.startingBankrollUsd;
  const totalEquityUsd = latestEquity?.totalEquityUsd ?? startingBankrollUsd;
  const wins = closed.filter((p) => (p.realizedPnlUsd ?? 0) > 0).length;

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const todayPnlUsd = closed
    .filter((p) => p.closedAt && p.closedAt >= startOfDay)
    .reduce((s, p) => s + (p.realizedPnlUsd ?? 0), 0);

  return {
    totalEquityUsd,
    startingBankrollUsd,
    totalPnlUsd: totalEquityUsd - startingBankrollUsd,
    totalPnlPct: (totalEquityUsd - startingBankrollUsd) / startingBankrollUsd,
    todayPnlUsd,
    openPositionCount: open.length,
    openExposureUsd: open.reduce((s, p) => s + p.costBasisUsd, 0),
    winRate: closed.length > 0 ? wins / closed.length : null,
    closedTradeCount: closed.length,
  };
}
