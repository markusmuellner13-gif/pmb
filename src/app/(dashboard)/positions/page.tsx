import { getBotConfig } from "../../../db/config";
import { getOpenPositions } from "../../../db/queries";
import { Badge } from "../../../components/Badge";

export const dynamic = "force-dynamic";

export default async function PositionsPage() {
  const config = await getBotConfig();
  const mode = config.tradingMode === "live" ? "live" : "paper";
  const open = await getOpenPositions(mode);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">Open Positions</h1>
        <p className="mt-1 text-sm text-text-secondary">
          {open.length} position{open.length === 1 ? "" : "s"} currently held in {mode} mode.
        </p>
      </header>

      <section className="card overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border-hairline)] text-xs uppercase tracking-wide text-text-muted">
              <th className="px-4 py-3 font-medium">Market</th>
              <th className="px-4 py-3 font-medium">Side</th>
              <th className="px-4 py-3 font-medium">Entry</th>
              <th className="px-4 py-3 font-medium">Size</th>
              <th className="px-4 py-3 font-medium">Cost basis</th>
              <th className="px-4 py-3 font-medium">Edge at entry</th>
              <th className="px-4 py-3 font-medium">Opened</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-hairline)]">
            {open.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-text-muted">
                  No open positions right now.
                </td>
              </tr>
            )}
            {open.map(({ position, market }) => (
              <tr key={position.id}>
                <td className="max-w-xs truncate px-4 py-3 text-text-primary">{market.question}</td>
                <td className="px-4 py-3">
                  <Badge tone={position.outcome === "ARB_BOTH" ? "warning" : "blue"}>
                    {position.outcome === "ARB_BOTH" ? "ARB" : position.outcome}
                  </Badge>
                </td>
                <td className="tabular px-4 py-3 text-text-secondary">
                  {position.entryPrice.toFixed(3)}
                </td>
                <td className="tabular px-4 py-3 text-text-secondary">
                  {position.size.toFixed(2)}
                </td>
                <td className="tabular px-4 py-3 text-text-secondary">
                  ${position.costBasisUsd.toFixed(2)}
                </td>
                <td className="tabular px-4 py-3 text-[var(--series-aqua)]">
                  {(position.entryEdge * 100).toFixed(1)}c
                </td>
                <td className="tabular px-4 py-3 text-xs text-text-muted">
                  {new Date(position.openedAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
