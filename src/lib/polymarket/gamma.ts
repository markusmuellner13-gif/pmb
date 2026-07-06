import { gammaEventSchema, gammaMarketSchema, type NormalizedMarket } from "./types";

const GAMMA_BASE = process.env.POLYMARKET_GAMMA_URL ?? "https://gamma-api.polymarket.com";

interface FetchActiveMarketsOptions {
  /** Total number of normalized binary markets to collect, ranked by 24h volume. */
  limit?: number;
  pageSize?: number;
}

/**
 * Pulls the most active binary (Yes/No) markets from Polymarket's public
 * Gamma API. Markets are fetched via the `/events` endpoint (not `/markets`
 * directly) specifically to get each market's category from its parent
 * event's `tags` -- the flat `/markets` endpoint has no category field at
 * all. Paginates over events (not markets) until `limit` normalized markets
 * have been collected; a single popular event can bundle 50+ markets, so
 * page counts don't map 1:1 to market counts. Markets that don't parse
 * cleanly or aren't a simple Yes/No pair are skipped rather than aborting
 * the whole scan.
 */
export async function fetchActiveMarkets(
  options: FetchActiveMarketsOptions = {}
): Promise<NormalizedMarket[]> {
  const limit = options.limit ?? 300;
  // Small event pages -- a single popular event can bundle 50+ markets, so a
  // large event-page size can overshoot `limit` by several hundred markets
  // before the outer loop gets a chance to stop.
  const eventPageSize = options.pageSize ?? 20;
  const results: NormalizedMarket[] = [];
  const seen = new Set<string>();

  outer: for (let offset = 0; results.length < limit && offset < limit * 5; offset += eventPageSize) {
    const url = new URL(`${GAMMA_BASE}/events`);
    url.searchParams.set("active", "true");
    url.searchParams.set("closed", "false");
    url.searchParams.set("archived", "false");
    url.searchParams.set("order", "volume24hr");
    url.searchParams.set("ascending", "false");
    url.searchParams.set("limit", String(eventPageSize));
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

    for (const rawEvent of body) {
      const parsedEvent = gammaEventSchema.safeParse(rawEvent);
      if (!parsedEvent.success) continue;
      const category = parsedEvent.data.tags[0]?.label ?? null;

      for (const rawMarket of parsedEvent.data.markets) {
        if (results.length >= limit) break outer;

        const normalized = normalizeGammaMarket(rawMarket, category);
        if (normalized && !seen.has(normalized.conditionId)) {
          seen.add(normalized.conditionId);
          results.push(normalized);
        }
      }
    }

    if (body.length < eventPageSize) break;
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

function normalizeGammaMarket(raw: unknown, category: string | null = null): NormalizedMarket | null {
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
    category,
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
