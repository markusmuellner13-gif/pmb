import { NextResponse } from "next/server";
import { getBotConfig, updateBotConfig } from "../../../db/config";
import { isLiveTradingConfigured } from "../../../lib/execution/live";

export async function GET() {
  const config = await getBotConfig();
  return NextResponse.json({ ...config, liveTradingConfigured: isLiveTradingConfigured() });
}

const EDITABLE_FIELDS = [
  "tradingMode",
  "killSwitch",
  "killSwitchReason",
  "walletAddress",
  "maxPositionUsd",
  "maxConcurrentPositions",
  "maxTotalExposurePct",
  "maxDailyLossUsd",
  "minEdgeThreshold",
  "minLiquidityUsd",
  "maxSpreadPct",
  "minHoursToResolution",
  "maxDaysToResolution",
  "takeProfitPct",
  "stopLossPct",
] as const;

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const patch: Record<string, unknown> = {};
  for (const key of EDITABLE_FIELDS) {
    if (key in body) patch[key] = body[key];
  }

  if (
    typeof patch.walletAddress === "string" &&
    patch.walletAddress !== "" &&
    !/^0x[a-fA-F0-9]{40}$/.test(patch.walletAddress)
  ) {
    return NextResponse.json({ error: "walletAddress must be a 0x-prefixed 40-char hex address" }, { status: 400 });
  }

  if (patch.tradingMode === "live" && !isLiveTradingConfigured()) {
    return NextResponse.json(
      {
        error:
          "Cannot switch to live trading: POLYMARKET_PRIVATE_KEY and POLYMARKET_FUNDER_ADDRESS are not set in this deployment's environment variables.",
      },
      { status: 400 }
    );
  }

  const updated = await updateBotConfig(patch);
  return NextResponse.json(updated);
}
