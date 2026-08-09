import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Tx } from "../db/client";
import { ledger } from "../db/schema";

/** Fixed system-account UUIDs, seeded by migration 0001. */
export const SYSTEM = {
  houseTreasury: "00000000-0000-0000-0000-000000000001",
  ammPool: "00000000-0000-0000-0000-000000000002",
  disputeEscrow: "00000000-0000-0000-0000-000000000003",
} as const;

export type LedgerReason =
  | "SIGNUP_GRANT"
  | "DAILY_DRIP"
  | "REFERRAL"
  | "TRADE"
  | "PAYOUT"
  | "NA_REFUND"
  | "DISPUTE_STAKE"
  | "DISPUTE_RETURN"
  | "DISPUTE_BOUNTY"
  | "DISPUTE_SLASH"
  | "SEED_SUBSIDY"
  | "RESOLUTION_SWEEP"
  | "QUEST_REWARD"
  | "ADMIN_ADJUST";

export interface LedgerEntry {
  userId: string;
  delta: bigint;
  reason: LedgerReason;
  refId?: string;
}

export class UnbalancedEntryGroupError extends Error {
  constructor(sum: bigint) {
    super(`ledger entry group does not sum to zero (sum = ${sum} µpts)`);
  }
}

/**
 * The ONLY code path that writes ledger rows. Every logical event posts one
 * balanced group (Σ delta = 0) and the users.points_balance cache is updated
 * in the same transaction. Callers must already hold whatever lock serializes
 * the event (e.g. the per-market advisory lock for trades).
 */
export async function postEntries(tx: Tx, entries: LedgerEntry[], entryGroup?: string): Promise<string> {
  if (entries.length === 0) throw new Error("empty ledger entry group");
  const sum = entries.reduce((a, e) => a + e.delta, 0n);
  if (sum !== 0n) throw new UnbalancedEntryGroupError(sum);

  const group = entryGroup ?? randomUUID();
  await tx.insert(ledger).values(
    entries.map((e) => ({
      entryGroup: group,
      userId: e.userId,
      delta: e.delta,
      reason: e.reason,
      refId: e.refId,
    })),
  );

  // Fold deltas per user, then update balance caches.
  const perUser = new Map<string, bigint>();
  for (const e of entries) {
    perUser.set(e.userId, (perUser.get(e.userId) ?? 0n) + e.delta);
  }
  for (const [userId, delta] of perUser) {
    if (delta === 0n) continue;
    await tx.execute(
      sql`UPDATE users SET points_balance = points_balance + ${delta} WHERE id = ${userId}`,
    );
  }
  return group;
}
