import { eq } from "drizzle-orm";
import { db } from "./client";
import { botConfig } from "./schema";

export type BotConfig = typeof botConfig.$inferSelect;

/** Fetches the singleton bot_config row, creating it with defaults on first run. */
export async function getBotConfig(): Promise<BotConfig> {
  const rows = await db.select().from(botConfig).where(eq(botConfig.id, 1));
  if (rows[0]) return rows[0];

  const inserted = await db.insert(botConfig).values({ id: 1 }).returning();
  return inserted[0];
}

export async function updateBotConfig(patch: Partial<Omit<BotConfig, "id">>) {
  await getBotConfig(); // ensure row exists
  await db
    .update(botConfig)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(botConfig.id, 1));
  return getBotConfig();
}
