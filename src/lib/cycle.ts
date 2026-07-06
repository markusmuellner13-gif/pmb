import { and, eq, gte, isNotNull } from "drizzle-orm";
import { db } from "../db/client";
import { getBotConfig, updateBotConfig, type BotConfig } from "../db/config";
import { cycleLogs, equityCurve, opportunities as opportunitiesTable, positions } from "../db/schema";
import { upsertMarketsAndSnapshots, getRecentSnapshotHistory } from "../db/markets";
import { fetchActiveMarkets, fetchMarketsByConditionIds } from "./polymarket/gamma";
import type { NormalizedMarket } from "./polymarket/types";
import {
  passesLiquidityFilters,
  scoreMarket,
  type ScoredOpportunity,
  type SnapshotPoint,
} from "./strategy/signals";
import { sizeOpportunity, checkExit, checkDailyLossBreaker, type PortfolioState } from "./strategy/risk";
import {
  getStrategyPerformance,
  getCategoryBreakdown,
  resolveConfidence,
  MIN_SAMPLES_FOR_ADJUSTMENT,
  type StrategyType,
} from "./strategy/learning";
import { openPaperPosition, closePaperPosition } from "./execution/paper";
import { isLiveTradingConfigured, placeLiveMarketOrder } from "./execution/live";

const SCAN_LIMIT = 300;
const CANDIDATE_LIMIT = 150; // top-N by volume considered for new opportunities each cycle
const CANDIDATE_PER_CATEGORY_CAP = 25; // keeps one hot event/category from crowding out the rest
const STALE_LOCK_MS = 5 * 60_000;
const EXPLORATION_SLOTS_PER_CYCLE = 2;
const EXPLORATION_MIN_EDGE = 0.005;
const EXPLORATION_SIZE_FRACTION = 0.2; // of maxPositionUsd -- exploration bets stay small on purpose

function strategyTypeOf(side: ScoredOpportunity["side"]): StrategyType {
  return side === "ARB_BOTH" ? "ARBITRAGE" : "MOMENTUM";
}

/**
 * Spreads candidate selection across categories instead of a flat
 * top-N-by-volume cut, which would otherwise let one enormous event (a
 * single World Cup market bundle can be 60+ markets) crowd out every other
 * category. Backfills with remaining highest-volume markets if the caps
 * leave the limit unfilled.
 */
function selectDiverseCandidates(
  markets: NormalizedMarket[],
  limit: number,
  perCategoryCap: number
): NormalizedMarket[] {
  const result: NormalizedMarket[] = [];
  const perCategoryCount = new Map<string, number>();

  for (const m of markets) {
    if (result.length >= limit) break;
    const key = m.category ?? "Uncategorized";
    const count = perCategoryCount.get(key) ?? 0;
    if (count >= perCategoryCap) continue;
    perCategoryCount.set(key, count + 1);
    result.push(m);
  }

  if (result.length < limit) {
    const included = new Set(result.map((m) => m.conditionId));
    for (const m of markets) {
      if (result.length >= limit) break;
      if (!included.has(m.conditionId)) result.push(m);
    }
  }

  return result;
}

export interface CycleSummary {
  status: "ok" | "skipped" | "error";
  message: string;
  marketsScanned: number;
  opportunitiesFound: number;
  positionsOpened: number;
  positionsClosed: number;
  durationMs: number;
}

export async function runCycle(): Promise<CycleSummary> {
  const startedAt = Date.now();
  const config = await getBotConfig();

  if (config.cycleRunning && config.cycleStartedAt) {
    const age = startedAt - config.cycleStartedAt.getTime();
    if (age < STALE_LOCK_MS) {
      return finish("skipped", "a cycle is already running", 0, 0, 0, 0, startedAt);
    }
  }

  await updateBotConfig({ cycleRunning: true, cycleStartedAt: new Date() });

  try {
    if (config.killSwitch) {
      return finish(
        "skipped",
        config.killSwitchReason ?? "kill switch is engaged",
        0,
        0,
        0,
        0,
        startedAt
      );
    }

    const mode = config.tradingMode === "live" ? "live" : "paper";
    if (mode === "live" && !isLiveTradingConfigured()) {
      await updateBotConfig({
        killSwitch: true,
        killSwitchReason: "tradingMode=live but POLYMARKET_PRIVATE_KEY/FUNDER_ADDRESS are not set",
      });
      return finish("error", "live trading misconfigured, kill switch engaged", 0, 0, 0, 0, startedAt);
    }

    const scanned = await fetchActiveMarkets({ limit: SCAN_LIMIT });
    await upsertMarketsAndSnapshots(scanned);

    const openPositions = await db
      .select()
      .from(positions)
      .where(and(eq(positions.status, "open"), eq(positions.mode, mode)));

    const byId = new Map(scanned.map((m) => [m.conditionId, m]));
    const missingIds = openPositions
      .map((p) => p.marketId)
      .filter((id) => !byId.has(id));
    const fetchedMissing = await fetchMarketsByConditionIds([...new Set(missingIds)]);
    for (const [id, m] of fetchedMissing) byId.set(id, m);

    let positionsClosed = 0;
    for (const position of openPositions) {
      const market = byId.get(position.marketId);
      if (!market) continue; // couldn't refresh this cycle; leave it open and retry next time

      if (market.closed) {
        await settleResolvedPosition(position, market);
        positionsClosed++;
        continue;
      }

      if (position.outcome === "ARB_BOTH") continue; // locked-in profit, held to resolution

      const currentPrice = position.outcome === "YES" ? market.yesPrice : market.noPrice;
      const hoursToResolution = market.endDate
        ? (market.endDate.getTime() - Date.now()) / 3_600_000
        : null;
      const exit = checkExit(position.entryPrice, currentPrice, config, hoursToResolution);
      if (exit.shouldExit) {
        await closePosition(position, currentPrice, exit.reason, mode);
        positionsClosed++;
      }
    }

    const candidates = selectDiverseCandidates(
      scanned.filter((m) => passesLiquidityFilters(m, config)),
      CANDIDATE_LIMIT,
      CANDIDATE_PER_CATEGORY_CAP
    );
    const history = await getRecentSnapshotHistory(candidates.map((m) => m.conditionId));

    const [arbPerf, momentumPerf] = await Promise.all([
      getStrategyPerformance("ARBITRAGE", mode),
      getStrategyPerformance("MOMENTUM", mode),
    ]);
    const confidenceCache = new Map<string, number>();
    async function confidenceFor(strategyType: StrategyType, category: string | null): Promise<number> {
      const key = `${strategyType}:${category ?? ""}`;
      const cached = confidenceCache.get(key);
      if (cached !== undefined) return cached;

      const strategyPerf = strategyType === "ARBITRAGE" ? arbPerf : momentumPerf;
      const categoryPerf = category
        ? await getStrategyPerformance(strategyType, mode, category)
        : null;
      const resolved = resolveConfidence(strategyPerf, categoryPerf);
      confidenceCache.set(key, resolved);
      return resolved;
    }

    const scored: { market: NormalizedMarket; opportunity: ScoredOpportunity }[] = [];
    for (const market of candidates) {
      const marketHistory = history.get(market.conditionId) ?? [];
      const opps = scoreMarket({ market, history: marketHistory }, config);
      for (const opp of opps) scored.push({ market, opportunity: opp });
    }
    scored.sort((a, b) => b.opportunity.score - a.opportunity.score);

    // Log the top opportunities regardless of whether the bot acts on them,
    // so the dashboard's "what the bot is watching" feed has something to show.
    const topForLog = scored.slice(0, 30);
    if (topForLog.length > 0) {
      await db.insert(opportunitiesTable).values(
        topForLog.map((s) => ({
          marketId: s.market.conditionId,
          side: s.opportunity.side,
          score: s.opportunity.score,
          edge: s.opportunity.edge,
          reasons: s.opportunity.reasons,
          acted: false,
        }))
      );
    }

    const refreshedOpen = await db
      .select()
      .from(positions)
      .where(and(eq(positions.status, "open"), eq(positions.mode, mode)));

    const portfolio: PortfolioState = {
      totalEquityUsd:
        mode === "paper"
          ? config.paperCashUsd + refreshedOpen.reduce((s, p) => s + p.costBasisUsd, 0)
          : config.startingBankrollUsd,
      openExposureUsd: refreshedOpen.reduce((s, p) => s + p.costBasisUsd, 0),
      openPositionCount: refreshedOpen.length,
      heldMarketIds: new Set(refreshedOpen.map((p) => p.marketId)),
    };

    let positionsOpened = 0;
    for (const { market, opportunity } of scored) {
      const strategyType = strategyTypeOf(opportunity.side);
      const confidenceMultiplier = await confidenceFor(strategyType, market.category);

      const sizing = sizeOpportunity(opportunity, market.conditionId, config, portfolio, confidenceMultiplier);
      if (!sizing.allowed) continue;

      try {
        if (mode === "paper") {
          await openPaperPosition({ market, opportunity, strategyType, sizeUsd: sizing.sizeUsd });
        } else {
          await openLivePosition(market, opportunity, strategyType, sizing.sizeUsd);
        }
        positionsOpened++;
        portfolio.openPositionCount++;
        portfolio.openExposureUsd += sizing.sizeUsd;
        portfolio.heldMarketIds.add(market.conditionId);

        await db
          .update(opportunitiesTable)
          .set({ acted: true })
          .where(eq(opportunitiesTable.marketId, market.conditionId));
      } catch (err) {
        // One failed trade shouldn't abort the whole cycle -- log and move on.
        console.error(`failed to open position for ${market.conditionId}`, err);
      }
    }

    positionsOpened += await runExplorationPass({
      candidates,
      history,
      config,
      mode,
      portfolio,
    });

    if (mode === "paper") {
      await recordEquityCurve("paper");
    }

    const todayPnl = await computeTodayPnl(mode);
    const breaker = checkDailyLossBreaker(config, todayPnl);
    if (breaker.trip) {
      await updateBotConfig({ killSwitch: true, killSwitchReason: breaker.reason });
    }

    return finish(
      "ok",
      "cycle completed",
      scanned.length,
      scored.length,
      positionsOpened,
      positionsClosed,
      startedAt
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.insert(cycleLogs).values({
      startedAt: new Date(startedAt),
      durationMs: Date.now() - startedAt,
      status: "error",
      message,
    });
    return {
      status: "error",
      message,
      marketsScanned: 0,
      opportunitiesFound: 0,
      positionsOpened: 0,
      positionsClosed: 0,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    await updateBotConfig({ cycleRunning: false });
  }
}

async function finish(
  status: CycleSummary["status"],
  message: string,
  marketsScanned: number,
  opportunitiesFound: number,
  positionsOpened: number,
  positionsClosed: number,
  startedAt: number
): Promise<CycleSummary> {
  const durationMs = Date.now() - startedAt;
  await db.insert(cycleLogs).values({
    startedAt: new Date(startedAt),
    durationMs,
    status,
    message,
    marketsScanned,
    opportunitiesFound,
    positionsOpened,
    positionsClosed,
  });
  return { status, message, marketsScanned, opportunitiesFound, positionsOpened, positionsClosed, durationMs };
}

interface ExplorationParams {
  candidates: NormalizedMarket[];
  history: Map<string, SnapshotPoint[]>;
  config: BotConfig;
  mode: "paper" | "live";
  portfolio: PortfolioState;
}

/**
 * Deliberately spends a small, capped number of paper (or live) trades per
 * cycle on categories the bot doesn't have much of a track record in yet --
 * classic explore-vs-exploit. Uses a much lower edge bar than normal trading
 * (still a real positive edge, just a smaller one) and sizes each bet at a
 * fraction of the normal max, so exploration can teach the learning loop
 * about a category without meaningfully risking the (paper) bankroll on it.
 */
async function runExplorationPass(params: ExplorationParams): Promise<number> {
  const { candidates, history, config, mode, portfolio } = params;

  const categoryBreakdown = await getCategoryBreakdown(mode);
  const sampleSizeByCategory = new Map(categoryBreakdown.map((c) => [c.category, c.sampleSize]));

  const byCategory = new Map<string, NormalizedMarket[]>();
  for (const m of candidates) {
    if (portfolio.heldMarketIds.has(m.conditionId)) continue;
    const key = m.category ?? "Uncategorized";
    const list = byCategory.get(key) ?? [];
    list.push(m);
    byCategory.set(key, list);
  }

  // Underexplored = fewer than MIN_SAMPLES_FOR_ADJUSTMENT closed trades so
  // far, including categories never traded at all (absent from the breakdown).
  const underexplored = [...byCategory.keys()].filter(
    (cat) => (sampleSizeByCategory.get(cat) ?? 0) < MIN_SAMPLES_FOR_ADJUSTMENT
  );

  const relaxedConfig: BotConfig = { ...config, minEdgeThreshold: EXPLORATION_MIN_EDGE };
  let opened = 0;

  for (const category of underexplored) {
    if (opened >= EXPLORATION_SLOTS_PER_CYCLE) break;

    let best: { market: NormalizedMarket; opportunity: ScoredOpportunity } | null = null;
    for (const market of byCategory.get(category) ?? []) {
      const marketHistory = history.get(market.conditionId) ?? [];
      for (const opp of scoreMarket({ market, history: marketHistory }, relaxedConfig)) {
        if (!best || opp.edge > best.opportunity.edge) best = { market, opportunity: opp };
      }
    }
    if (!best) continue;

    const strategyType = strategyTypeOf(best.opportunity.side);
    const sizing = sizeOpportunity(best.opportunity, best.market.conditionId, config, portfolio, 1);
    if (!sizing.allowed) continue;

    const exploreSizeUsd = Math.min(sizing.sizeUsd, config.maxPositionUsd * EXPLORATION_SIZE_FRACTION);
    if (exploreSizeUsd < 1) continue;

    try {
      if (mode === "paper") {
        await openPaperPosition({
          market: best.market,
          opportunity: best.opportunity,
          strategyType,
          sizeUsd: exploreSizeUsd,
          isExploration: true,
        });
      } else {
        await openLivePosition(best.market, best.opportunity, strategyType, exploreSizeUsd, true);
      }
      opened++;
      portfolio.openPositionCount++;
      portfolio.openExposureUsd += exploreSizeUsd;
      portfolio.heldMarketIds.add(best.market.conditionId);
    } catch (err) {
      console.error(`failed to open exploration position for ${best.market.conditionId}`, err);
    }
  }

  return opened;
}

async function closePosition(
  position: typeof positions.$inferSelect,
  exitPrice: number,
  reason: string,
  mode: "paper" | "live"
) {
  if (mode === "paper") {
    await closePaperPosition(position.id, exitPrice, reason);
  } else {
    await sellLivePosition(position, exitPrice, reason);
  }
}

async function settleResolvedPosition(
  position: typeof positions.$inferSelect,
  market: NormalizedMarket
) {
  // A resolved binary market settles at $1 for the winning outcome, $0 for the
  // losing one. ARB_BOTH holds one full unit of each side, so it always
  // settles at exactly $1 regardless of which outcome won. Live positions
  // settle on-chain automatically via conditional token redemption; this just
  // mirrors the outcome into our own ledger so the dashboard stays accurate.
  let exitPrice: number;
  if (position.outcome === "ARB_BOTH") {
    exitPrice = 1;
  } else {
    const yesWon = market.yesPrice > market.noPrice;
    const positionWon = (position.outcome === "YES") === yesWon;
    exitPrice = positionWon ? 1 : 0;
  }

  await closePaperPosition(position.id, exitPrice, "market resolved");
}

async function openLivePosition(
  market: NormalizedMarket,
  opportunity: ScoredOpportunity,
  strategyType: StrategyType,
  sizeUsd: number,
  isExploration = false
) {
  if (opportunity.side === "ARB_BOTH") {
    const half = sizeUsd / 2;
    await placeLiveMarketOrder(market.yesTokenId, "BUY", half);
    await placeLiveMarketOrder(market.noTokenId, "BUY", half);
  } else {
    const tokenId = opportunity.side === "YES" ? market.yesTokenId : market.noTokenId;
    await placeLiveMarketOrder(tokenId, "BUY", sizeUsd);
  }
  // Mirror into our own ledger (positions/trades) using the paper engine's
  // bookkeeping so the dashboard has one consistent data model for both modes.
  await openPaperPosition({ market, opportunity, strategyType, sizeUsd, isExploration });
}

async function sellLivePosition(
  position: typeof positions.$inferSelect,
  exitPrice: number,
  reason: string
) {
  // Real unwind requires the token ID, which isn't stored directly on the
  // position row; live selling is intentionally left as a manual/future
  // enhancement (see README) -- the bot will not auto-sell live positions
  // mid-market yet. It still marks the ledger so the dashboard stays honest.
  await closePaperPosition(position.id, exitPrice, `${reason} (ledger only, no live sell order placed)`);
}

async function recordEquityCurve(mode: "paper") {
  const config = await getBotConfig();
  const open = await db
    .select()
    .from(positions)
    .where(and(eq(positions.status, "open"), eq(positions.mode, mode)));
  const positionsValueUsd = open.reduce((s, p) => s + p.costBasisUsd, 0);
  const realizedToday = await computeTodayPnl(mode);

  await db.insert(equityCurve).values({
    mode,
    cashUsd: config.paperCashUsd,
    positionsValueUsd,
    totalEquityUsd: config.paperCashUsd + positionsValueUsd,
    realizedPnlTodayUsd: realizedToday,
  });
}

async function computeTodayPnl(mode: "paper" | "live"): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const closedToday = await db
    .select({ realizedPnlUsd: positions.realizedPnlUsd })
    .from(positions)
    .where(
      and(
        eq(positions.status, "closed"),
        eq(positions.mode, mode),
        isNotNull(positions.realizedPnlUsd),
        gte(positions.closedAt, startOfDay)
      )
    );

  return closedToday.reduce((s, p) => s + (p.realizedPnlUsd ?? 0), 0);
}
