import { getBotConfig } from "../../db/config";
import {
  getEquityCurve,
  getOverviewStats,
  getRecentCycleLogs,
  getRecentOpportunities,
} from "../../db/queries";
import { getCategoryBreakdown, MIN_SAMPLES_FOR_ADJUSTMENT } from "../../lib/strategy/learning";
import { StatCard } from "../../components/StatCard";
import { Badge } from "../../components/Badge";
import { EquityChart } from "../../components/EquityChart";
import { KillSwitchToggle } from "../../components/KillSwitchToggle";
import { RunCycleButton } from "../../components/RunCycleButton";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const config = await getBotConfig();
  const mode = config.tradingMode === "live" ? "live" : "paper";
  const [stats, equity, opportunities, cycleLogs, categoryBreakdown] = await Promise.all([
    getOverviewStats(mode),
    getEquityCurve(mode),
    getRecentOpportunities(15),
    getRecentCycleLogs(8),
    getCategoryBreakdown(mode),
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

      <section className="card p-5">
        <h2 className="mb-1 text-sm font-medium text-text-secondary">Learning by category</h2>
        <p className="mb-3 text-xs text-text-muted">
          The bot deliberately paper-trades small, capped bets in categories it hasn&apos;t seen
          much of yet (below {MIN_SAMPLES_FOR_ADJUSTMENT} closed trades), then sizes future bets
          up or down per category as a real track record builds.
        </p>
        {categoryBreakdown.length === 0 ? (
          <p className="py-4 text-sm text-text-muted">
            No closed trades yet — this fills in as positions resolve.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-xs uppercase tracking-wide text-text-muted">
                  <th className="py-2 pr-4 font-medium">Category</th>
                  <th className="py-2 pr-4 font-medium">Closed trades</th>
                  <th className="py-2 pr-4 font-medium">Win rate</th>
                  <th className="py-2 pr-4 font-medium">Avg return</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {categoryBreakdown.map((c) => (
                  <tr key={c.category}>
                    <td className="py-2 pr-4 text-text-primary">{c.category}</td>
                    <td className="tabular py-2 pr-4 text-text-secondary">{c.sampleSize}</td>
                    <td className="tabular py-2 pr-4 text-text-secondary">
                      {c.winRate === null ? "—" : `${(c.winRate * 100).toFixed(0)}%`}
                    </td>
                    <td
                      className={`tabular py-2 pr-4 ${
                        (c.avgReturnPct ?? 0) >= 0
                          ? "text-[var(--status-good)]"
                          : "text-[var(--status-critical)]"
                      }`}
                    >
                      {c.avgReturnPct === null ? "—" : `${(c.avgReturnPct * 100).toFixed(1)}%`}
                    </td>
                    <td className="py-2">
                      {c.sampleSize >= MIN_SAMPLES_FOR_ADJUSTMENT ? (
                        <Badge tone="blue">learned, {c.confidenceMultiplier.toFixed(2)}x sizing</Badge>
                      ) : (
                        <Badge tone="neutral">still exploring</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
