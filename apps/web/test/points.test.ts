import { MICRO, pts } from "@poporslop/lmsr";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/server/db/client";
import { users } from "../src/server/db/schema";
import { DAILY_DRIP, REFERRAL_BONUS, signup } from "../src/server/services/auth";
import { checkInvariants } from "../src/server/services/invariants";
import { claimDailyDrip, maybePayReferral } from "../src/server/services/points";
import { executeTrade } from "../src/server/services/trade";
import { makeMarket, makeUser, resetDb } from "./helpers";

async function expectClean() {
  expect(await checkInvariants()).toEqual([]);
}

async function balance(userId: string): Promise<bigint> {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  return u!.pointsBalance;
}

describe("daily drip (spec §6.2)", () => {
  beforeEach(resetDb);

  it("grants 25 pts once per UTC day, idempotent under re-claims", async () => {
    const userId = await makeUser();
    expect(await claimDailyDrip(userId)).toBe(true);
    expect(await balance(userId)).toBe(pts(1000) + DAILY_DRIP);
    expect(await claimDailyDrip(userId)).toBe(false);
    expect(await claimDailyDrip(userId)).toBe(false);
    expect(await balance(userId)).toBe(pts(1000) + DAILY_DRIP);
    await expectClean();
  });

  it("grants again on the next day", async () => {
    const userId = await makeUser();
    expect(await claimDailyDrip(userId)).toBe(true);
    await db.execute(sql`UPDATE users SET last_drip_on = last_drip_on - 1 WHERE id = ${userId}`);
    expect(await claimDailyDrip(userId)).toBe(true);
    expect(await balance(userId)).toBe(pts(1000) + 2n * DAILY_DRIP);
    await expectClean();
  });

  it("is race-safe: concurrent claims grant exactly once", async () => {
    const userId = await makeUser();
    const results = await Promise.all(Array.from({ length: 10 }, () => claimDailyDrip(userId)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await balance(userId)).toBe(pts(1000) + DAILY_DRIP);
    await expectClean();
  });

  it("does not drip to banned users", async () => {
    const userId = await makeUser();
    await db.execute(sql`UPDATE users SET flags = flags || '{"banned": true}' WHERE id = ${userId}`);
    expect(await claimDailyDrip(userId)).toBe(false);
  });
});

describe("referral bonus (spec §6.2)", () => {
  beforeEach(resetDb);

  it("pays the referrer 250 pts on the referee's first trade, exactly once", async () => {
    const referrer = await signup({ handle: "referrer", deviceFp: "fp-referrer" });
    const referee = await signup({ handle: "referee", ref: "referrer", deviceFp: "fp-referee" });
    const market = await makeMarket();

    await executeTrade({ userId: referee.userId, marketId: market.id, outcomeIdx: 0, deltaShares: 10n * MICRO });
    expect(await maybePayReferral(referee.userId)).toBe(true);
    expect(await balance(referrer.userId)).toBe(pts(1000) + REFERRAL_BONUS);

    // Second trade / second call: no double payout.
    await executeTrade({ userId: referee.userId, marketId: market.id, outcomeIdx: 0, deltaShares: 5n * MICRO });
    expect(await maybePayReferral(referee.userId)).toBe(false);
    expect(await balance(referrer.userId)).toBe(pts(1000) + REFERRAL_BONUS);
    await expectClean();
  });

  it("denies the bonus when referrer and referee share a device fingerprint", async () => {
    const referrer = await signup({ handle: "selfref", deviceFp: "same-device" });
    const referee = await signup({ handle: "sockpuppet", ref: "selfref", deviceFp: "same-device" });
    expect(await maybePayReferral(referee.userId)).toBe(false);
    expect(await balance(referrer.userId)).toBe(pts(1000));
    // The attempt is burned — no retry after swapping fingerprints.
    expect(await maybePayReferral(referee.userId)).toBe(false);
    await expectClean();
  });

  it("ignores unknown and self referral handles at signup", async () => {
    const a = await signup({ handle: "aaa", ref: "does-not-exist" });
    const b = await signup({ handle: "bbb", ref: "bbb" });
    const [ua] = await db.select().from(users).where(eq(users.id, a.userId));
    const [ub] = await db.select().from(users).where(eq(users.id, b.userId));
    expect(ua!.referredBy).toBeNull();
    expect(ub!.referredBy).toBeNull();
    expect(await maybePayReferral(a.userId)).toBe(false);
  });

  it("no payout for users without a referrer", async () => {
    const userId = await makeUser();
    const market = await makeMarket();
    await executeTrade({ userId, marketId: market.id, outcomeIdx: 0, deltaShares: MICRO });
    expect(await maybePayReferral(userId)).toBe(false);
    await expectClean();
  });
});
