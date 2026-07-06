import { getBotConfig } from "../../../db/config";
import { getClosedPositions } from "../../../db/queries";
import { Badge } from "../../../components/Badge";

export const dynamic = "force-dynamic";

export default async function TradesPage() {
  const config = await getBotConfig();
  const mode = config.tradingMode === "live" ? "live" : "paper";
  const closed = await getClosedPositions(mode, 200);

  const wins = closed.filter((c) => (c.position.realizedPnlUsd ?? 0) > 0).length;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">Trade History</h1>
        <p className="mt-1 text-sm text-text-secondary">
          {closed.length} closed position{closed.length === 1 ? "" : "s"} · {wins} wins ·{" "}
          {closed.length - wins} losses
        </p>
      </header>

      <section className="card overflow-x-auto p-0">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border-hairline)] text-xs uppercase tracking-wide text-text-muted">
              <th className="px-4 py-3 font-medium">Market</th>
              <th className="px-4 py-3 font-medium">Strategy</th>
              <th className="px-4 py-3 font-medium">Side</th>
              <th className="px-4 py-3 font-medium">Entry → Exit</th>
              <th className="px-4 py-3 font-medium">P&L</th>
              <th className="px-4 py-3 font-medium">Reason</th>
              <th className="px-4 py-3 font-medium">Closed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-hairline)]">
            {closed.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-text-muted">
                  No closed trades yet.
                </td>
              </tr>
            )}
            {closed.map(({ position, market }) => {
              const pnl = position.realizedPnlUsd ?? 0;
              return (
                <tr key={position.id}>
                  <td className="max-w-xs truncate px-4 py-3 text-text-primary">
                    {market.question}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone="neutral">{position.strategyType}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={position.outcome === "ARB_BOTH" ? "warning" : "blue"}>
                      {position.outcome === "ARB_BOTH" ? "ARB" : position.outcome}
                    </Badge>
                  </td>
                  <td className="tabular px-4 py-3 text-text-secondary">
                    {position.entryPrice.toFixed(3)} → {(position.exitPrice ?? 0).toFixed(3)}
                  </td>
                  <td
                    className={`tabular px-4 py-3 font-medium ${
                      pnl >= 0 ? "text-[var(--status-good)]" : "text-[var(--status-critical)]"
                    }`}
                  >
                    {pnl >= 0 ? "+" : ""}
                    {pnl.toFixed(2)}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-xs text-text-muted">
                    {position.closeReason}
                  </td>
                  <td className="tabular px-4 py-3 text-xs text-text-muted">
                    {position.closedAt ? new Date(position.closedAt).toLocaleString() : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
