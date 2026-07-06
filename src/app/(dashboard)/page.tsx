import { getBotConfig } from "../../db/config";
import {
  getEquityCurve,
  getOverviewStats,
  getRecentCycleLogs,
  getRecentOpportunities,
} from "../../db/queries";
import { StatCard } from "../../components/StatCard";
import { Badge } from "../../components/Badge";
import { EquityChart } from "../../components/EquityChart";
import { KillSwitchToggle } from "../../components/KillSwitchToggle";
import { RunCycleButton } from "../../components/RunCycleButton";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const config = await getBotConfig();
  const mode = config.tradingMode === "live" ? "live" : "paper";
  const [stats, equity, opportunities, cycleLogs] = await Promise.all([
    getOverviewStats(mode),
    getEquityCurve(mode),
    getRecentOpportunities(15),
    getRecentCycleLogs(8),
  ]);

  const equityData = equity.map((e) => ({
    timestamp: new Date(e.timestamp).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    totalEquityUsd: e.totalEquityUsd,
  }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">Overview</h1>
            <Badge tone={mode === "live" ? "critical" : "blue"}>
              {mode === "live" ? "LIVE — real money" : "PAPER — simulated"}
            </Badge>
            <Badge tone={config.killSwitch ? "critical" : "good"}>
              {config.killSwitch ? "Paused" : "Active"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            {config.killSwitch
              ? config.killSwitchReason ?? "Trading is paused."
              : "Scanning Polymarket for mispriced and momentum opportunities every cycle."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <RunCycleButton />
          <KillSwitchToggle engaged={config.killSwitch} />
        </div>
      </header>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Total Equity"
          value={`$${stats.totalEquityUsd.toFixed(2)}`}
          sub={`from $${stats.startingBankrollUsd.toFixed(0)} starting bankroll`}
        />
        <StatCard
          label="Total P&L"
          value={`${stats.totalPnlUsd >= 0 ? "+" : ""}$${stats.totalPnlUsd.toFixed(2)}`}
          sub={`${(stats.totalPnlPct * 100).toFixed(1)}%`}
          tone={stats.totalPnlUsd >= 0 ? "good" : "bad"}
        />
        <StatCard
          label="Today's P&L"
          value={`${stats.todayPnlUsd >= 0 ? "+" : ""}$${stats.todayPnlUsd.toFixed(2)}`}
          tone={stats.todayPnlUsd >= 0 ? "good" : "bad"}
        />
        <StatCard
          label="Win Rate"
          value={stats.winRate === null ? "—" : `${(stats.winRate * 100).toFixed(0)}%`}
          sub={`${stats.closedTradeCount} closed trades`}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Open Positions" value={String(stats.openPositionCount)} />
        <StatCard label="Open Exposure" value={`$${stats.openExposureUsd.toFixed(2)}`} />
        <StatCard
          label="Max Position Size"
          value={`$${config.maxPositionUsd.toFixed(0)}`}
          sub="per trade cap"
        />
        <StatCard
          label="Daily Loss Limit"
          value={`$${config.maxDailyLossUsd.toFixed(0)}`}
          sub="auto-pause trigger"
        />
      </div>

      <section className="card p-5">
        <h2 className="mb-2 text-sm font-medium text-text-secondary">Equity curve</h2>
        <EquityChart data={equityData} />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <section className="card p-5 lg:col-span-3">
          <h2 className="mb-3 text-sm font-medium text-text-secondary">
            What the bot is watching
          </h2>
          <div className="flex flex-col divide-y divide-[var(--border-hairline)]">
            {opportunities.length === 0 && (
              <p className="py-6 text-sm text-text-muted">
                No opportunities scanned yet — run a scan to populate this feed.
              </p>
            )}
            {opportunities.map(({ opportunity, market }) => (
              <div key={opportunity.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge tone={opportunity.side === "ARB_BOTH" ? "warning" : "blue"}>
                      {opportunity.side === "ARB_BOTH" ? "ARBITRAGE" : opportunity.side}
                    </Badge>
                    {opportunity.acted && <Badge tone="good">traded</Badge>}
                    <span className="truncate text-sm text-text-primary">{market.question}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-text-muted">
                    {(opportunity.reasons as string[])[0]}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="tabular text-sm font-medium text-[var(--series-aqua)]">
                    {(opportunity.edge * 100).toFixed(1)}c edge
                  </div>
                  <div className="tabular text-xs text-text-muted">
                    {new Date(opportunity.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-5 lg:col-span-2">
          <h2 className="mb-3 text-sm font-medium text-text-secondary">Recent scan cycles</h2>
          <div className="flex flex-col divide-y divide-[var(--border-hairline)]">
            {cycleLogs.length === 0 && (
              <p className="py-6 text-sm text-text-muted">No cycles have run yet.</p>
            )}
            {cycleLogs.map((log) => (
              <div key={log.id} className="flex items-center justify-between py-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <Badge
                    tone={log.status === "ok" ? "good" : log.status === "error" ? "critical" : "neutral"}
                  >
                    {log.status}
                  </Badge>
                  <span className="text-text-secondary">
                    {log.marketsScanned} scanned · {log.positionsOpened} opened ·{" "}
                    {log.positionsClosed} closed
                  </span>
                </div>
                <span className="tabular text-xs text-text-muted">
                  {new Date(log.startedAt).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
