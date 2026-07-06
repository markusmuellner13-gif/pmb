CREATE TABLE `bot_config` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trading_mode` text DEFAULT 'paper' NOT NULL,
	`wallet_address` text,
	`kill_switch` integer DEFAULT false NOT NULL,
	`kill_switch_reason` text,
	`starting_bankroll_usd` real DEFAULT 1000 NOT NULL,
	`paper_cash_usd` real DEFAULT 1000 NOT NULL,
	`max_position_usd` real DEFAULT 50 NOT NULL,
	`max_concurrent_positions` integer DEFAULT 15 NOT NULL,
	`max_total_exposure_pct` real DEFAULT 0.6 NOT NULL,
	`max_daily_loss_usd` real DEFAULT 75 NOT NULL,
	`min_edge_threshold` real DEFAULT 0.04 NOT NULL,
	`min_liquidity_usd` real DEFAULT 2000 NOT NULL,
	`max_spread_pct` real DEFAULT 0.08 NOT NULL,
	`min_hours_to_resolution` real DEFAULT 2 NOT NULL,
	`max_days_to_resolution` real DEFAULT 45 NOT NULL,
	`take_profit_pct` real DEFAULT 0.35 NOT NULL,
	`stop_loss_pct` real DEFAULT 0.25 NOT NULL,
	`cycle_running` integer DEFAULT false NOT NULL,
	`cycle_started_at` integer,
	`updated_at` integer DEFAULT (unixepoch('now', 'subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cycle_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` integer DEFAULT (unixepoch('now', 'subsec') * 1000) NOT NULL,
	`duration_ms` integer,
	`markets_scanned` integer DEFAULT 0 NOT NULL,
	`opportunities_found` integer DEFAULT 0 NOT NULL,
	`positions_opened` integer DEFAULT 0 NOT NULL,
	`positions_closed` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'ok' NOT NULL,
	`message` text
);
--> statement-breakpoint
CREATE INDEX `cycle_logs_started_idx` ON `cycle_logs` (`started_at`);--> statement-breakpoint
CREATE TABLE `equity_curve` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` integer DEFAULT (unixepoch('now', 'subsec') * 1000) NOT NULL,
	`mode` text NOT NULL,
	`cash_usd` real NOT NULL,
	`positions_value_usd` real NOT NULL,
	`total_equity_usd` real NOT NULL,
	`realized_pnl_today_usd` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `equity_curve_ts_idx` ON `equity_curve` (`timestamp`);--> statement-breakpoint
CREATE TABLE `market_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`market_id` text NOT NULL,
	`timestamp` integer DEFAULT (unixepoch('now', 'subsec') * 1000) NOT NULL,
	`yes_price` real NOT NULL,
	`no_price` real NOT NULL,
	`best_bid` real,
	`best_ask` real,
	`spread_pct` real,
	`liquidity_usd` real,
	`volume_24hr_usd` real,
	FOREIGN KEY (`market_id`) REFERENCES `markets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `market_snapshots_market_ts_idx` ON `market_snapshots` (`market_id`,`timestamp`);--> statement-breakpoint
CREATE TABLE `markets` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`question` text NOT NULL,
	`category` text,
	`yes_token_id` text NOT NULL,
	`no_token_id` text NOT NULL,
	`end_date` integer,
	`active` integer DEFAULT true NOT NULL,
	`closed` integer DEFAULT false NOT NULL,
	`first_seen_at` integer DEFAULT (unixepoch('now', 'subsec') * 1000) NOT NULL,
	`last_synced_at` integer
);
--> statement-breakpoint
CREATE TABLE `opportunities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`market_id` text NOT NULL,
	`timestamp` integer DEFAULT (unixepoch('now', 'subsec') * 1000) NOT NULL,
	`side` text NOT NULL,
	`score` real NOT NULL,
	`edge` real NOT NULL,
	`reasons` text NOT NULL,
	`acted` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`market_id`) REFERENCES `markets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `opportunities_ts_idx` ON `opportunities` (`timestamp`);--> statement-breakpoint
CREATE TABLE `positions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`market_id` text NOT NULL,
	`outcome` text NOT NULL,
	`strategy_type` text DEFAULT 'MOMENTUM' NOT NULL,
	`mode` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`entry_price` real NOT NULL,
	`entry_edge` real DEFAULT 0 NOT NULL,
	`entry_score` real DEFAULT 0 NOT NULL,
	`reasons` text,
	`size` real NOT NULL,
	`cost_basis_usd` real NOT NULL,
	`exit_price` real,
	`realized_pnl_usd` real,
	`close_reason` text,
	`opened_at` integer DEFAULT (unixepoch('now', 'subsec') * 1000) NOT NULL,
	`closed_at` integer,
	FOREIGN KEY (`market_id`) REFERENCES `markets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `positions_status_idx` ON `positions` (`status`);--> statement-breakpoint
CREATE TABLE `trades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`position_id` integer,
	`market_id` text NOT NULL,
	`outcome` text NOT NULL,
	`action` text NOT NULL,
	`mode` text NOT NULL,
	`price` real NOT NULL,
	`size` real NOT NULL,
	`value_usd` real NOT NULL,
	`reasons` text,
	`tx_hash` text,
	`created_at` integer DEFAULT (unixepoch('now', 'subsec') * 1000) NOT NULL,
	FOREIGN KEY (`position_id`) REFERENCES `positions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`market_id`) REFERENCES `markets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `trades_created_idx` ON `trades` (`created_at`);