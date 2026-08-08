import { sql } from "drizzle-orm";
import type { Tx } from "../db/client";

/** classid namespace for PopOrSlop advisory locks. */
const LOCK_CLASS = 0x0b0b;

/**
 * Map a market UUID to a stable int4 for pg_advisory_xact_lock(int4, int4).
 * First 8 hex chars → signed 32-bit. Collisions merely over-serialize.
 */
export function marketLockKey(marketId: string): number {
  const hex = marketId.replace(/-/g, "").slice(0, 8);
  return Number.parseInt(hex, 16) | 0;
}

/**
 * Serialize all mutations of one market for the duration of the transaction.
 * Auto-released at COMMIT/ROLLBACK.
 */
export async function lockMarket(tx: Tx, marketId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${LOCK_CLASS}, ${marketLockKey(marketId)})`);
}
