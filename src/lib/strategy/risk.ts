import type { BotConfig } from "../../db/config";
import type { ScoredOpportunity } from "./signals";

export interface PortfolioState {
  totalEquityUsd: number;
  openExposureUsd: number;
  openPositionCount: number;
  /** Set of condition IDs the bot already holds a position in. */
  heldMarketIds: Set<string>;
}

export interface SizingResult {
  allowed: boolean;
  sizeUsd: number;
  reason: string;
}

/**
 * Decides how much (if anything) to risk on a scored opportunity, given
 * current portfolio exposure and the configured risk limits. Never returns
 * more than `maxPositionUsd`, and refuses new risk once exposure or position
 * count limits are hit -- this is the only thing standing between the
 * strategy and "chase max profit" blowing up the paper (or real) account.
 */
export function sizeOpportunity(
  opportunity: ScoredOpportunity,
  marketId: string,
  config: BotConfig,
  portfolio: PortfolioState,
  confidenceMultiplier = 1
): SizingResult {
  if (portfolio.heldMarketIds.has(marketId)) {
    return { allowed: false, sizeUsd: 0, reason: "already holding a position in this market" };
  }

  if (portfolio.openPositionCount >= config.maxConcurrentPositions) {
    return { allowed: false, sizeUsd: 0, reason: "max concurrent positions reached" };
  }

  const maxExposureUsd = portfolio.totalEquityUsd * config.maxTotalExposurePct;
  const remainingBudget = maxExposureUsd - portfolio.openExposureUsd;
  if (remainingBudget <= 1) {
    return { allowed: false, sizeUsd: 0, reason: "max total exposure reached" };
  }

  const edgeScale =
    opportunity.side === "ARB_BOTH" ? 1 : Math.min(1, opportunity.edge / 0.15);

  const sizeUsd = Math.max(
    0,
    Math.min(
      config.maxPositionUsd,
      remainingBudget,
      config.maxPositionUsd * edgeScale * confidenceMultiplier
    )
  );

  if (sizeUsd < 1) {
    return { allowed: false, sizeUsd: 0, reason: "computed size below $1 minimum" };
  }

  return { allowed: true, sizeUsd, reason: "ok" };
}

export interface LossBreakerResult {
  trip: boolean;
  reason: string;
}

/** Circuit breaker: once realized+unrealized P&L for the day breaches the configured
 * daily loss limit, trading stops until a human clears the kill switch. */
export function checkDailyLossBreaker(
  config: BotConfig,
  todayPnlUsd: number
): LossBreakerResult {
  if (todayPnlUsd <= -Math.abs(config.maxDailyLossUsd)) {
    return {
      trip: true,
      reason: `Daily P&L of $${todayPnlUsd.toFixed(2)} breached -$${config.maxDailyLossUsd.toFixed(2)} limit`,
    };
  }
  return { trip: false, reason: "ok" };
}

export interface ExitDecision {
  shouldExit: boolean;
  reason: string;
}

/** Take-profit / stop-loss check for an existing position, in percent-of-cost-basis terms. */
export function checkExit(
  entryPrice: number,
  currentPrice: number,
  config: BotConfig,
  hoursToResolution: number | null
): ExitDecision {
  const pctChange = (currentPrice - entryPrice) / entryPrice;

  if (pctChange >= config.takeProfitPct) {
    return { shouldExit: true, reason: `take profit at +${(pctChange * 100).toFixed(1)}%` };
  }
  if (pctChange <= -config.stopLossPct) {
    return { shouldExit: true, reason: `stop loss at ${(pctChange * 100).toFixed(1)}%` };
  }
  if (hoursToResolution !== null && hoursToResolution <= config.minHoursToResolution) {
    return { shouldExit: true, reason: "approaching resolution, closing to avoid settlement risk" };
  }
  return { shouldExit: false, reason: "hold" };
}
