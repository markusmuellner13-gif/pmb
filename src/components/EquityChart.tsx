"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface EquityPoint {
  timestamp: string;
  totalEquityUsd: number;
}

export function EquityChart({ data }: { data: EquityPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-text-muted">
        No equity history yet — it will appear after the first scan cycle runs.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--series-blue)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--series-blue)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--gridline)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="timestamp"
          tick={{ fill: "var(--text-muted)", fontSize: 11 }}
          axisLine={{ stroke: "var(--gridline)" }}
          tickLine={false}
          minTickGap={40}
        />
        <YAxis
          tick={{ fill: "var(--text-muted)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={64}
          tickFormatter={(v: number) => `$${v.toFixed(0)}`}
        />
        <Tooltip
          contentStyle={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-hairline)",
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: "var(--text-secondary)" }}
          formatter={(value) => [`$${Number(value).toFixed(2)}`, "Equity"]}
        />
        <Area
          type="monotone"
          dataKey="totalEquityUsd"
          stroke="var(--series-blue)"
          strokeWidth={2}
          fill="url(#equityFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
