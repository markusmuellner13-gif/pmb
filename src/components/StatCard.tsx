export function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "good" | "bad";
}) {
  const valueColor =
    tone === "good"
      ? "text-[var(--status-good)]"
      : tone === "bad"
        ? "text-[var(--status-critical)]"
        : "text-text-primary";

  return (
    <div className="card p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</div>
      <div className={`tabular mt-2 text-2xl font-semibold ${valueColor}`}>{value}</div>
      {sub ? <div className="mt-1 text-xs text-text-secondary">{sub}</div> : null}
    </div>
  );
}
