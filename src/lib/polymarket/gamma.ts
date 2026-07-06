import { gammaMarketSchema, type NormalizedMarket } from "./types";

const GAMMA_BASE = process.env.POLYMARKET_GAMMA_URL ?? "https://gamma-api.polymarket.com";

interface FetchActiveMarketsOptions {
  /** Total number of markets to pull across pages, ranked by 24h volume. */
  limit?: number;
  pageSize?: number;
}

/**
 * Pulls the most active binary (Yes/No) markets from Polymarket's public
 * Gamma API, paginating until `limit` is reached. Markets that don't parse
 * cleanly or aren't a simple Yes/No pair are skipped rather than aborting
 * the whole scan.
 */
export async function fetchActiveMarkets(
  options: FetchActiveMarketsOptions = {}
): Promise<NormalizedMarket[]> {
  const limit = options.limit ?? 300;
  const pageSize = Math.min(options.pageSize ?? 100, limit);
  const results: NormalizedMarket[] = [];

  for (let offset = 0; offset < limit; offset += pageSize) {
    const url = new URL(`${GAMMA_BASE}/markets`);
    url.searchParams.set("active", "true");
    url.searchParams.set("closed", "false");
    url.searchParams.set("archived", "false");
    url.searchParams.set("order", "volume24hr");
    url.searchParams.set("ascending", "false");
    url.searchParams.set("limit", String(Math.min(pageSize, limit - offset)));
    url.searchParams.set("offset", String(offset));

    const res = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Gamma API ${res.status} ${res.statusText} for ${url}`);
    }
    const body = (await res.json()) as unknown[];
    if (!Array.isArray(body) || body.length === 0) break;

    for (const raw of body) {
      const normalized = normalizeGammaMarket(raw);
      if (normalized) results.push(normalized);
    }

    if (body.length < pageSize) break;
  }

  return results;
}

/**
 * Fetches specific markets by condition ID, used to mark-to-market and check
 * exit conditions on positions whose market has fallen out of the top-volume
 * scan window. Returns whatever the API gives back; callers must tolerate a
 * missing entry (market may be temporarily unlisted, or the filter param
 * name may differ from what's assumed here) and skip that position for the
 * cycle rather than fail.
 */
export async function fetchMarketsByConditionIds(
  conditionIds: string[]
): Promise<Map<string, NormalizedMarket>> {
  const result = new Map<string, NormalizedMarket>();
  if (conditionIds.length === 0) return result;

  const url = new URL(`${GAMMA_BASE}/markets`);
  url.searchParams.set("condition_ids", conditionIds.join(","));
  url.searchParams.set("limit", String(conditionIds.length));

  try {
    const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return result;
    const body = (await res.json()) as unknown[];
    if (!Array.isArray(body)) return result;
    for (const raw of body) {
      const normalized = normalizeGammaMarket(raw);
      if (normalized) result.set(normalized.conditionId, normalized);
    }
  } catch {
    // Network/parse hiccup: caller treats missing entries as "skip this cycle".
  }

  return result;
}

function normalizeGammaMarket(raw: unknown): NormalizedMarket | null {
  const parsed = gammaMarketSchema.safeParse(raw);
  if (!parsed.success) return null;
  const m = parsed.data;

  const conditionId = m.conditionId ?? m.id;
  const outcomes = m.outcomes ?? [];
  const outcomePrices = m.outcomePrices ?? [];
  const tokenIds = m.clobTokenIds ?? [];

  if (outcomes.length !== 2 || tokenIds.length !== 2) return null;

  const yesIdx = outcomes.findIndex((o) => o.trim().toLowerCase() === "yes");
  const noIdx = outcomes.findIndex((o) => o.trim().toLowerCase() === "no");
  if (yesIdx === -1 || noIdx === -1) return null;

  const yesPrice = Number(outcomePrices[yesIdx]);
  const noPrice = Number(outcomePrices[noIdx]);
  if (!Number.isFinite(yesPrice) || !Number.isFinite(noPrice)) return null;

  return {
    conditionId,
    slug: m.slug,
    question: m.question,
    category: m.category ?? null,
    endDate: m.endDate ? new Date(m.endDate) : null,
    active: m.active,
    closed: m.closed,
    yesTokenId: tokenIds[yesIdx],
    noTokenId: tokenIds[noIdx],
    yesPrice,
    noPrice,
    bestBid: m.bestBid ?? null,
    bestAsk: m.bestAsk ?? null,
    spreadPct: m.spread ?? null,
    liquidityUsd: m.liquidityNum ?? 0,
    volume24hrUsd: m.volume24hr ?? 0,
  };
}
