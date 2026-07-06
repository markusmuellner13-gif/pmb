"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RunCycleButton() {
  const [pending, setPending] = useState(false);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const router = useRouter();

  async function run() {
    setPending(true);
    setLastMessage(null);
    try {
      const res = await fetch("/api/bot/run-cycle", { method: "POST" });
      const data = await res.json();
      setLastMessage(
        data.status === "ok"
          ? `Scanned ${data.marketsScanned} markets, opened ${data.positionsOpened}, closed ${data.positionsClosed}`
          : data.message ?? "cycle skipped"
      );
      router.refresh();
    } catch {
      setLastMessage("Failed to reach the bot API");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={run}
        disabled={pending}
        className="rounded-lg bg-[var(--series-blue)] px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Scanning…" : "Run scan now"}
      </button>
      {lastMessage ? <span className="text-xs text-text-secondary">{lastMessage}</span> : null}
    </div>
  );
}
