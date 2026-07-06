import { z } from "zod";

/**
 * Polymarket's Gamma API returns several fields as JSON-encoded strings
 * (e.g. `"[\"0.45\", \"0.55\"]"`) and mixes numbers/strings across fields.
 * This schema is deliberately permissive and coerces everything, so a single
 * unexpected field never crashes a whole scan cycle -- callers should still
 * treat a parse failure for one market as skippable, not fatal.
 */
const jsonArray = z
  .string()
  .transform((s, ctx) => {
    try {
      const parsed = JSON.parse(s);
      if (!Array.isArray(parsed)) throw new Error("not an array");
      return parsed as string[];
    } catch {
      ctx.addIssue({ code: "custom", message: "invalid JSON array string" });
      return z.NEVER;
    }
  })
  .or(z.array(z.string()));

const numLike = z.coerce.number().catch(0);

export const gammaMarketSchema = z.object({
  id: z.string(),
  conditionId: z.string().optional(),
  question: z.string(),
  slug: z.string().optional().default(""),
  active: z.boolean().optional().default(true),
  closed: z.boolean().optional().default(false),
  archived: z.boolean().optional().default(false),
  endDate: z.string().nullable().optional(),
  liquidityNum: numLike.optional(),
  volumeNum: numLike.optional(),
  volume24hr: numLike.optional(),
  bestBid: numLike.optional(),
  bestAsk: numLike.optional(),
  spread: numLike.optional(),
  lastTradePrice: numLike.optional(),
  outcomes: jsonArray.optional(),
  outcomePrices: jsonArray.optional(),
  clobTokenIds: jsonArray.optional(),
});

export type GammaMarket = z.infer<typeof gammaMarketSchema>;

/**
 * Categories don't live on the market object -- they live on the parent
 * "event" (Polymarket's grouping of related markets) as a `tags` array,
 * broadest tag first (e.g. "Sports" before "Soccer" before "FIFA World Cup").
 * Confirmed against the live API; see git history for the diagnostic.
 */
export const gammaEventSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  tags: z
    .array(z.object({ label: z.string().optional() }))
    .optional()
    .default([]),
  markets: z.array(z.unknown()).optional().default([]),
});

export type GammaEvent = z.infer<typeof gammaEventSchema>;

/** Normalized, binary (Yes/No) market ready for the strategy engine. */
export interface NormalizedMarket {
  conditionId: string;
  slug: string;
  question: string;
  category: string | null;
  endDate: Date | null;
  active: boolean;
  closed: boolean;
  yesTokenId: string;
  noTokenId: string;
  yesPrice: number;
  noPrice: number;
  bestBid: number | null;
  bestAsk: number | null;
  spreadPct: number | null;
  liquidityUsd: number;
  volume24hrUsd: number;
}

export const orderBookLevelSchema = z.object({
  price: z.coerce.number(),
  size: z.coerce.number(),
});

export const orderBookSchema = z.object({
  market: z.string().optional(),
  asset_id: z.string().optional(),
  bids: z.array(orderBookLevelSchema).default([]),
  asks: z.array(orderBookLevelSchema).default([]),
});

export type OrderBook = z.infer<typeof orderBookSchema>;
