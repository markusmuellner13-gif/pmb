import { getRecentOpportunities } from "../../../db/queries";
import { Badge } from "../../../components/Badge";

export const dynamic = "force-dynamic";

export default async function MarketsPage() {
  const opportunities = await getRecentOpportunities(150);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">Opportunities</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Every market the bot has scored recently, ranked by the edge it found — this is the
          bot&apos;s read on what looks mispriced or moving, not a guarantee.
        </p>
      </header>

      <section className="card overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border-hairline)] text-xs uppercase tracking-wide text-text-muted">
              <th className="px-4 py-3 font-medium">Market</th>
              <th className="px-4 py-3 font-medium">Signal</th>
              <th className="px-4 py-3 font-medium">Edge</th>
              <th className="px-4 py-3 font-medium">Score</th>
              <th className="px-4 py-3 font-medium">Why</th>
              <th className="px-4 py-3 font-medium">Acted</th>
              <th className="px-4 py-3 font-medium">Seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-hairline)]">
            {opportunities.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-text-muted">
                  No scans have run yet — trigger one from the Overview page.
                </td>
              </tr>
            )}
            {opportunities.map(({ opportunity, market }) => (
              <tr key={opportunity.id}>
                <td className="max-w-xs truncate px-4 py-3 text-text-primary">{market.question}</td>
                <td className="px-4 py-3">
                  <Badge tone={opportunity.side === "ARB_BOTH" ? "warning" : "blue"}>
                    {opportunity.side === "ARB_BOTH" ? "ARBITRAGE" : `BUY ${opportunity.side}`}
                  </Badge>
                </td>
                <td className="tabular px-4 py-3 text-[var(--series-aqua)]">
                  {(opportunity.edge * 100).toFixed(1)}c
                </td>
                <td className="tabular px-4 py-3 text-text-secondary">
                  {opportunity.score.toFixed(1)}
                </td>
                <td className="max-w-[280px] truncate px-4 py-3 text-xs text-text-muted">
                  {(opportunity.reasons as string[]).join(" · ")}
                </td>
                <td className="px-4 py-3">
                  {opportunity.acted ? <Badge tone="good">yes</Badge> : <Badge tone="neutral">no</Badge>}
                </td>
                <td className="tabular px-4 py-3 text-xs text-text-muted">
                  {new Date(opportunity.timestamp).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
