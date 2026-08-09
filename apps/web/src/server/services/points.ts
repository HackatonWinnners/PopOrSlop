import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";
import { DAILY_DRIP, REFERRAL_BONUS } from "./auth";
import { SYSTEM, postEntries } from "./ledger";

/**
 * Daily active drip (spec §6.2): 25 pts, once per UTC day, claimed on visit —
 * "active" means the app was opened with a live session. The conditional
 * UPDATE on last_drip_on serializes concurrent claims; the ledger group and
 * the flag land in one transaction.
 */
export async function claimDailyDrip(userId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const res = await tx.execute(sql`
      UPDATE users
      SET last_drip_on = (now() AT TIME ZONE 'utc')::date
      WHERE id = ${userId}
        AND is_system = false
        AND NOT (flags ? 'banned')
        AND (last_drip_on IS NULL OR last_drip_on < (now() AT TIME ZONE 'utc')::date)
      RETURNING id
    `);
    if (res.rowCount !== 1) return false;
    await postEntries(tx, [
      { userId: SYSTEM.houseTreasury, delta: -DAILY_DRIP, reason: "DAILY_DRIP", refId: userId },
      { userId, delta: DAILY_DRIP, reason: "DAILY_DRIP", refId: userId },
    ]);
    return true;
  });
}

/**
 * Referral bonus (spec §6.2): 250 pts to the referrer, paid once, when the
 * referee places their FIRST trade (skin in the game, not just a signup —
 * that plus the fingerprint check is the anti-farming rule from the PRD).
 * The flags-guarded UPDATE makes the payout exactly-once under concurrency.
 */
export async function maybePayReferral(refereeId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const res = await tx.execute<{ referred_by: string; device_fp: string | null; handle: string }>(sql`
      UPDATE users
      SET flags = flags || '{"referral_paid": true}'
      WHERE id = ${refereeId}
        AND referred_by IS NOT NULL
        AND NOT (flags ? 'referral_paid')
      RETURNING referred_by, device_fp, handle
    `);
    const row = res.rows[0];
    if (!row) return false;

    const [referrer] = await tx.select().from(users).where(eq(users.id, row.referred_by));
    if (!referrer || referrer.isSystem || (referrer.flags as Record<string, unknown>).banned) {
      return false;
    }
    // Best-effort self-referral detection (spec §8: the rule is the deterrent).
    if (row.device_fp && referrer.deviceFp && row.device_fp === referrer.deviceFp) {
      console.warn(
        `[points] referral denied: @${row.handle} and referrer @${referrer.handle} share a device fingerprint`,
      );
      return false;
    }
    await postEntries(tx, [
      { userId: SYSTEM.houseTreasury, delta: -REFERRAL_BONUS, reason: "REFERRAL", refId: refereeId },
      { userId: referrer.id, delta: REFERRAL_BONUS, reason: "REFERRAL", refId: refereeId },
    ]);
    return true;
  });
}
