import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

/** Singleton row (id = 1) holding all tunable risk/trading settings. */
export const botConfig = sqliteTable("bot_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tradingMode: text("trading_mode").notNull().default("paper"), // "paper" | "live"
  walletAddress: text("wallet_address"), // public Polymarket/Polygon address, display only
  killSwitch: integer("kill_switch", { mode: "boolean" }).notNull().default(false),
  killSwitchReason: text("kill_switch_reason"),
  startingBankrollUsd: real("starting_bankroll_usd").notNull().default(1000),
  paperCashUsd: real("paper_cash_usd").notNull().default(1000),
  maxPositionUsd: real("max_position_usd").notNull().default(50),
  maxConcurrentPositions: integer("max_concurrent_positions").notNull().default(15),
  maxTotalExposurePct: real("max_total_exposure_pct").notNull().default(0.6),
  maxDailyLossUsd: real("max_daily_loss_usd").notNull().default(75),
  minEdgeThreshold: real("min_edge_threshold").notNull().default(0.04),
  minLiquidityUsd: real("min_liquidity_usd").notNull().default(2000),
  maxSpreadPct: real("max_spread_pct").notNull().default(0.08),
  minHoursToResolution: real("min_hours_to_resolution").notNull().default(2),
  maxDaysToResolution: real("max_days_to_resolution").notNull().default(45),
  takeProfitPct: real("take_profit_pct").notNull().default(0.35),
  stopLossPct: real("stop_loss_pct").notNull().default(0.25),
  cycleRunning: integer("cycle_running", { mode: "boolean" }).notNull().default(false),
  cycleStartedAt: integer("cycle_started_at", { mode: "timestamp_ms" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('now', 'subsec') * 1000)`),
});

export const markets = sqliteTable("markets", {
  id: text("id").primaryKey(), // Polymarket condition_id
  slug: text("slug").notNull(),
  question: text("question").notNull(),
  category: text("category"),
  yesTokenId: text("yes_token_id").notNull(),
  noTokenId: text("no_token_id").notNull(),
  endDate: integer("end_date", { mode: "timestamp_ms" }),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  closed: integer("closed", { mode: "boolean" }).notNull().default(false),
  firstSeenAt: integer("first_seen_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('now', 'subsec') * 1000)`),
  lastSyncedAt: integer("last_synced_at", { mode: "timestamp_ms" }),
});

export const marketSnapshots = sqliteTable(
  "market_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    marketId: text("market_id")
      .notNull()
      .references(() => markets.id),
    timestamp: integer("timestamp", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch('now', 'subsec') * 1000)`),
    yesPrice: real("yes_price").notNull(),
    noPrice: real("no_price").notNull(),
    bestBid: real("best_bid"),
    bestAsk: real("best_ask"),
    spreadPct: real("spread_pct"),
    liquidityUsd: real("liquidity_usd"),
    volume24hrUsd: real("volume_24hr_usd"),
  },
  (t) => [index("market_snapshots_market_ts_idx").on(t.marketId, t.timestamp)]
);

export const opportunities = sqliteTable(
  "opportunities",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    marketId: text("market_id")
      .notNull()
      .references(() => markets.id),
    timestamp: integer("timestamp", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch('now', 'subsec') * 1000)`),
    side: text("side").notNull(), // "YES" | "NO" | "ARB_BOTH"
    score: real("score").notNull(),
    edge: real("edge").notNull(),
    reasons: text("reasons", { mode: "json" }).$type<string[]>().notNull(),
    acted: integer("acted", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("opportunities_ts_idx").on(t.timestamp)]
);

export const positions = sqliteTable(
  "positions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    marketId: text("market_id")
      .notNull()
      .references(() => markets.id),
    outcome: text("outcome").notNull(), // "YES" | "NO" | "ARB_BOTH"
    strategyType: text("strategy_type").notNull().default("MOMENTUM"), // "ARBITRAGE" | "MOMENTUM"
    category: text("category"), // snapshot of the market's category at entry, for learning-by-category
    isExploration: integer("is_exploration", { mode: "boolean" }).notNull().default(false),
    mode: text("mode").notNull(), // "paper" | "live"
    status: text("status").notNull().default("open"), // "open" | "closed"
    entryPrice: real("entry_price").notNull(),
    entryEdge: real("entry_edge").notNull().default(0),
    entryScore: real("entry_score").notNull().default(0),
    reasons: text("reasons", { mode: "json" }).$type<string[]>(),
    size: real("size").notNull(), // number of shares (or share-pairs for ARB_BOTH)
    costBasisUsd: real("cost_basis_usd").notNull(),
    exitPrice: real("exit_price"),
    realizedPnlUsd: real("realized_pnl_usd"),
    closeReason: text("close_reason"),
    openedAt: integer("opened_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch('now', 'subsec') * 1000)`),
    closedAt: integer("closed_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("positions_status_idx").on(t.status)]
);

export const trades = sqliteTable(
  "trades",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    positionId: integer("position_id").references(() => positions.id),
    marketId: text("market_id")
      .notNull()
      .references(() => markets.id),
    outcome: text("outcome").notNull(), // "YES" | "NO"
    action: text("action").notNull(), // "BUY" | "SELL"
    mode: text("mode").notNull(), // "paper" | "live"
    price: real("price").notNull(),
    size: real("size").notNull(),
    valueUsd: real("value_usd").notNull(),
    reasons: text("reasons", { mode: "json" }).$type<string[]>(),
    txHash: text("tx_hash"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch('now', 'subsec') * 1000)`),
  },
  (t) => [index("trades_created_idx").on(t.createdAt)]
);

export const equityCurve = sqliteTable(
  "equity_curve",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    timestamp: integer("timestamp", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch('now', 'subsec') * 1000)`),
    mode: text("mode").notNull(), // "paper" | "live"
    cashUsd: real("cash_usd").notNull(),
    positionsValueUsd: real("positions_value_usd").notNull(),
    totalEquityUsd: real("total_equity_usd").notNull(),
    realizedPnlTodayUsd: real("realized_pnl_today_usd").notNull().default(0),
  },
  (t) => [index("equity_curve_ts_idx").on(t.timestamp)]
);

export const cycleLogs = sqliteTable(
  "cycle_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    startedAt: integer("started_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch('now', 'subsec') * 1000)`),
    durationMs: integer("duration_ms"),
    marketsScanned: integer("markets_scanned").notNull().default(0),
    opportunitiesFound: integer("opportunities_found").notNull().default(0),
    positionsOpened: integer("positions_opened").notNull().default(0),
    positionsClosed: integer("positions_closed").notNull().default(0),
    status: text("status").notNull().default("ok"), // "ok" | "error" | "skipped"
    message: text("message"),
  },
  (t) => [index("cycle_logs_started_idx").on(t.startedAt)]
);
