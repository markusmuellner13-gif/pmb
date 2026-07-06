"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { BotConfig } from "../db/config";

interface Props {
  config: BotConfig;
  liveTradingConfigured: boolean;
}

const NUMERIC_FIELDS: { key: keyof BotConfig; label: string; hint: string; step?: string }[] = [
  { key: "maxPositionUsd", label: "Max position size ($)", hint: "cap per single trade" },
  { key: "maxConcurrentPositions", label: "Max concurrent positions", hint: "how many trades open at once" },
  {
    key: "maxTotalExposurePct",
    label: "Max total exposure",
    hint: "fraction of bankroll at risk at once (0-1)",
    step: "0.05",
  },
  { key: "maxDailyLossUsd", label: "Daily loss limit ($)", hint: "auto-pauses trading if breached" },
  { key: "minEdgeThreshold", label: "Min edge threshold", hint: "smallest edge worth trading (0-1)", step: "0.01" },
  { key: "minLiquidityUsd", label: "Min market liquidity ($)", hint: "skip thin markets" },
  { key: "maxSpreadPct", label: "Max spread", hint: "skip wide-spread markets (0-1)", step: "0.01" },
  { key: "minHoursToResolution", label: "Min hours to resolution", hint: "avoid last-minute settlement risk" },
  { key: "maxDaysToResolution", label: "Max days to resolution", hint: "avoid tying up capital too long" },
  { key: "takeProfitPct", label: "Take profit", hint: "close a winner at this % gain (0-1)", step: "0.01" },
  { key: "stopLossPct", label: "Stop loss", hint: "close a loser at this % drop (0-1)", step: "0.01" },
];

export function SettingsForm({ config, liveTradingConfigured }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<BotConfig>(config);
  const [wallet, setWallet] = useState(config.walletAddress ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(patch: Record<string, unknown>) {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/bot-config", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "failed to save");
        return;
      }
      setValues(data);
      setMessage("Saved.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="card p-5">
        <h2 className="mb-3 text-sm font-medium text-text-secondary">Trading mode</h2>
        <div className="flex flex-wrap items-center gap-3">
          <button
            disabled={saving || values.tradingMode === "paper"}
            onClick={() => save({ tradingMode: "paper" })}
            className="rounded-lg bg-[var(--surface-2)] px-3 py-2 text-sm font-medium text-text-primary disabled:opacity-50"
          >
            Paper trading
          </button>
          <button
            disabled={saving || values.tradingMode === "live" || !liveTradingConfigured}
            onClick={() => save({ tradingMode: "live" })}
            title={
              liveTradingConfigured
                ? "Switch to live trading with real funds"
                : "Set POLYMARKET_PRIVATE_KEY and POLYMARKET_FUNDER_ADDRESS as Vercel env vars first"
            }
            className="rounded-lg bg-[var(--status-critical)]/15 px-3 py-2 text-sm font-medium text-[var(--status-critical)] ring-1 ring-[var(--status-critical)]/30 disabled:opacity-40"
          >
            Live trading (real money)
          </button>
          <span className="text-xs text-text-muted">
            Currently: <strong className="text-text-secondary">{values.tradingMode}</strong>
            {!liveTradingConfigured && " · live trading credentials not configured on this deployment"}
          </span>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-medium text-text-secondary">
          Connect your Polymarket wallet (public address only)
        </h2>
        <p className="mb-3 text-xs text-text-muted">
          This is your public wallet address, safe to store — used only to label the dashboard.
          It never grants trading access. Live order signing uses{" "}
          <code className="rounded bg-[var(--surface-2)] px-1">POLYMARKET_PRIVATE_KEY</code> as a
          Vercel secret instead, which is never typed into this UI.
        </p>
        <div className="flex flex-wrap gap-3">
          <input
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            placeholder="0x..."
            className="w-full max-w-md rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-2)] px-3 py-2 text-sm text-text-primary outline-none focus:ring-1 focus:ring-[var(--series-blue)]"
          />
          <button
            disabled={saving}
            onClick={() => save({ walletAddress: wallet })}
            className="rounded-lg bg-[var(--series-blue)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Save address
          </button>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-4 text-sm font-medium text-text-secondary">Risk parameters</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {NUMERIC_FIELDS.map((field) => (
            <label key={field.key} className="flex flex-col gap-1">
              <span className="text-xs font-medium text-text-secondary">{field.label}</span>
              <input
                type="number"
                step={field.step ?? "1"}
                defaultValue={values[field.key] as number}
                onBlur={(e) => save({ [field.key]: Number(e.target.value) })}
                className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-2)] px-3 py-2 text-sm tabular text-text-primary outline-none focus:ring-1 focus:ring-[var(--series-blue)]"
              />
              <span className="text-[11px] text-text-muted">{field.hint}</span>
            </label>
          ))}
        </div>
      </section>

      {message && <p className="text-sm text-text-secondary">{message}</p>}
    </div>
  );
}
