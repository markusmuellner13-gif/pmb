import { orderBookSchema, type OrderBook } from "./types";

const CLOB_BASE = process.env.POLYMARKET_CLOB_URL ?? "https://clob.polymarket.com";

/** Fetches the live order book for a single CLOB token. Read-only, no auth required. */
export async function fetchOrderBook(tokenId: string): Promise<OrderBook | null> {
  const url = new URL(`${CLOB_BASE}/book`);
  url.searchParams.set("token_id", tokenId);

  const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
  if (!res.ok) return null;

  const parsed = orderBookSchema.safeParse(await res.json());
  return parsed.success ? parsed.data : null;
}

/** Order book imbalance in [-1, 1]: positive means more resting size on the bid (buy) side. */
export function bookImbalance(book: OrderBook, depth = 5): number {
  const bidSize = book.bids.slice(0, depth).reduce((s, l) => s + l.size, 0);
  const askSize = book.asks.slice(0, depth).reduce((s, l) => s + l.size, 0);
  const total = bidSize + askSize;
  if (total === 0) return 0;
  return (bidSize - askSize) / total;
}
