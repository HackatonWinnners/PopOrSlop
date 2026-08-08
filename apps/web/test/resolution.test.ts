import { MICRO, pts } from "@poporslop/lmsr";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/server/db/client";
import { markets, positions, users } from "../src/server/db/schema";
import { DomainError } from "../src/server/services/errors";
import { checkInvariants } from "../src/server/services/invariants";
import {
  DISPUTE_BOUNTY,
  DISPUTE_STAKE,
  fileDispute,
  finalizeDueMarkets,
  lockDueMarkets,
  naRefund,
  postResolution,
  resolveDispute,
  resolveNow,
} from "../src/server/services/resolution";
import { executeTrade } from "../src/server/services/trade";
import { makeMarket, makeUser, resetDb } from "./helpers";

async function expectClean() {
  expect(await checkInvariants()).toEqual([]);
}

async function balance(userId: string): Promise<bigint> {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  return u!.pointsBalance;
}

const EVIDENCE = [{ source: "manual", summary: "test resolution" }];

describe("resolution lifecycle", () => {
  beforeEach(resetDb);

  it("full happy path: trade → lock → propose → finalize → winners paid, ledger zero", async () => {
    const winner = await makeUser();
    const loser = await makeUser();
    const market = await makeMarket();

    const buyW = await executeTrade({
      userId: winner,
      marketId: market.id,
      outcomeIdx: 0,
      deltaShares: 100n * MICRO,
    });
    const buyL = await executeTrade({
      userId: loser,
      marketId: market.id,
      outcomeIdx: 1,
      deltaShares: 80n * MICRO,
    });

    await db.update(markets).set({ closeAt: new Date(Date.now() - 1000) }).where(eq(markets.id, market.id));
    const locked = await lockDueMarkets();
    expect(locked).toContain(market.id);

    await postResolution({
      marketId: market.id,
      outcomeIdx: 0,
      evidence: EVIDENCE,
      proposer: "admin",
      disputeWindowHours: 0,
    });
    const finalized = await finalizeDueMarkets();
    expect(finalized).toContain(market.id);

    // Winner: 1000 − cost + 100 shares paying 100 pts.
    expect(await balance(winner)).toBe(pts(1000) - buyW.cost + 100n * MICRO * 1n);
    expect(await balance(loser)).toBe(pts(1000) - buyL.cost);

    const [m] = await db.select().from(markets).where(eq(markets.id, market.id));
    expect(m!.status).toBe("RESOLVED");
    expect(await db.select().from(positions).where(eq(positions.marketId, market.id))).toEqual([]);
    await expectClean();
  });

  it("resolveNow (W0 demo mode) pays out immediately from LOCKED", async () => {
    const user = await makeUser();
    const market = await makeMarket();
    await executeTrade({ userId: user, marketId: market.id, outcomeIdx: 0, deltaShares: 50n * MICRO });
    await db.update(markets).set({ closeAt: new Date(Date.now() - 1000) }).where(eq(markets.id, market.id));
    await lockDueMarkets();
    await resolveNow({ marketId: market.id, outcomeIdx: 0, evidence: EVIDENCE, proposer: "admin" });
    const [m] = await db.select().from(markets).where(eq(markets.id, market.id));
    expect(m!.status).toBe("RESOLVED");
    await expectClean();
  });

  it("N/A refund returns cost basis and eats the pool imbalance", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const market = await makeMarket();
    await executeTrade({ userId: a, marketId: market.id, outcomeIdx: 0, deltaShares: 60n * MICRO });
    await executeTrade({ userId: b, marketId: market.id, outcomeIdx: 1, deltaShares: 40n * MICRO });

    await naRefund(market.id);

    expect(await balance(a)).toBe(pts(1000));
    expect(await balance(b)).toBe(pts(1000));
    const [m] = await db.select().from(markets).where(eq(markets.id, market.id));
    expect(m!.status).toBe("NA_REFUNDED");
    await expectClean();
  });

  it("dispute overturned: stake returned + bounty, corrected outcome pays", async () => {
    const trader = await makeUser();
    const disputer = await makeUser();
    const council = await makeUser();
    const market = await makeMarket();
    const buy = await executeTrade({
      userId: trader,
      marketId: market.id,
      outcomeIdx: 1,
      deltaShares: 30n * MICRO,
    });

    await db.update(markets).set({ closeAt: new Date(Date.now() - 1000) }).where(eq(markets.id, market.id));
    await lockDueMarkets();
    // Admin proposes outcome 0 — wrongly.
    await postResolution({ marketId: market.id, outcomeIdx: 0, evidence: EVIDENCE, proposer: "admin" });

    const disputeId = await fileDispute({ marketId: market.id, userId: disputer, reason: "wrong outcome" });
    expect(await balance(disputer)).toBe(pts(1000) - DISPUTE_STAKE);

    // Window is open, so the finalizer must skip it.
    expect(await finalizeDueMarkets(new Date(Date.now() + 49 * 3600_000))).toEqual([]);

    await resolveDispute({ disputeId, upheld: false, correctedOutcomeIdx: 1, councilUserId: council });

    expect(await balance(disputer)).toBe(pts(1000) + DISPUTE_BOUNTY);
    expect(await balance(trader)).toBe(pts(1000) - buy.cost + 30n * MICRO);
    const [m] = await db.select().from(markets).where(eq(markets.id, market.id));
    expect(m!.status).toBe("RESOLVED");
    expect(m!.resolvedOutcome).toBe(1);
    await expectClean();
  });

  it("dispute upheld: stake slashed, original outcome pays", async () => {
    const disputer = await makeUser();
    const council = await makeUser();
    const market = await makeMarket();

    await db.update(markets).set({ closeAt: new Date(Date.now() - 1000) }).where(eq(markets.id, market.id));
    await lockDueMarkets();
    await postResolution({ marketId: market.id, outcomeIdx: 0, evidence: EVIDENCE, proposer: "admin" });
    const disputeId = await fileDispute({ marketId: market.id, userId: disputer, reason: "vibes" });
    await resolveDispute({ disputeId, upheld: true, councilUserId: council });

    expect(await balance(disputer)).toBe(pts(1000) - DISPUTE_STAKE);
    const [m] = await db.select().from(markets).where(eq(markets.id, market.id));
    expect(m!.status).toBe("RESOLVED");
    expect(m!.resolvedOutcome).toBe(0);
    await expectClean();
  });

  it("payout is idempotent: a second finalize pass is a no-op", async () => {
    const market = await makeMarket();
    await db.update(markets).set({ closeAt: new Date(Date.now() - 1000) }).where(eq(markets.id, market.id));
    await lockDueMarkets();
    await postResolution({
      marketId: market.id,
      outcomeIdx: 0,
      evidence: EVIDENCE,
      proposer: "admin",
      disputeWindowHours: 0,
    });
    expect(await finalizeDueMarkets()).toContain(market.id);
    expect(await finalizeDueMarkets()).toEqual([]);
    await expectClean();
  });

  it("cannot trade a locked market; cannot propose on an open one", async () => {
    const user = await makeUser();
    const market = await makeMarket();
    await expect(
      postResolution({ marketId: market.id, outcomeIdx: 0, evidence: EVIDENCE, proposer: "admin" }),
    ).rejects.toThrow(DomainError);
    await db.update(markets).set({ closeAt: new Date(Date.now() - 1000) }).where(eq(markets.id, market.id));
    await lockDueMarkets();
    await expect(
      executeTrade({ userId: user, marketId: market.id, outcomeIdx: 0, deltaShares: MICRO }),
    ).rejects.toThrow(new DomainError("MARKET_CLOSED"));
  });
});
