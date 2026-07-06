"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function KillSwitchToggle({ engaged }: { engaged: boolean }) {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function toggle() {
    setPending(true);
    try {
      await fetch("/api/bot-config", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          killSwitch: !engaged,
          killSwitchReason: engaged ? null : "manually paused from dashboard",
        }),
      });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
        engaged
          ? "bg-[var(--status-good)]/15 text-[var(--status-good)] ring-1 ring-[var(--status-good)]/30 hover:bg-[var(--status-good)]/25"
          : "bg-[var(--status-critical)]/15 text-[var(--status-critical)] ring-1 ring-[var(--status-critical)]/30 hover:bg-[var(--status-critical)]/25"
      }`}
    >
      {pending ? "Working…" : engaged ? "Resume trading" : "Pause trading (kill switch)"}
    </button>
  );
}
