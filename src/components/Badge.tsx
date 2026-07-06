const STYLES: Record<string, string> = {
  good: "bg-[var(--status-good)]/15 text-[var(--status-good)] ring-1 ring-[var(--status-good)]/30",
  warning:
    "bg-[var(--status-warning)]/15 text-[var(--status-warning)] ring-1 ring-[var(--status-warning)]/30",
  critical:
    "bg-[var(--status-critical)]/15 text-[var(--status-critical)] ring-1 ring-[var(--status-critical)]/30",
  blue: "bg-[var(--series-blue)]/15 text-[var(--series-blue)] ring-1 ring-[var(--series-blue)]/30",
  neutral: "bg-[var(--surface-2)] text-text-secondary ring-1 ring-[var(--border-hairline)]",
};

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: keyof typeof STYLES;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${STYLES[tone]}`}
    >
      {children}
    </span>
  );
}
