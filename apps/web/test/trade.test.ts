import { MICRO, pts } from "@poporslop/lmsr";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/server/db/client";
import { lmsrState, markets, trades, users } from "../src/server/db/schema";
import { DomainError } from "../src/server/services/errors";
import { checkInvariants } from "../src/server/services/invariants";
import { executeTrade } from "../src/server/services/trade";
import { makeMarket, makeUser, resetDb } from "./helpers";

async function expectClean() {
  expect(await checkInvariants()).toEqual([]);
}

describe("trade transaction", () => {
  beforeEach(resetDb);

  it("buy then sell round trip: user never profits, ledger stays balanced", async () => {
    const userId = await makeUser();
    const market = await makeMarket();

    const buy = await executeTrade({
      userId,
      marketId: market.id,
      outcomeIdx: 0,
      deltaShares: 100n * MICRO,
    });
    expect(buy.cost > 0n).toBe(true);

    const sell = await executeTrade({
      userId,
      marketId: market.id,
      outcomeIdx: 0,
      deltaShares: -100n * MICRO,
    });
    expect(sell.cost < 0n).toBe(true);
    expect(buy.cost + sell.cost >= 0n).toBe(true); // no-arb through the full stack

    const [u] = await db.select().from(users).where(eq(users.id, userId));
    expect(u!.pointsBalance <= pts(1000)).toBe(true);
    await expectClean();
  });

  it("budget mode buys the maximal affordable shares", async () => {
    const userId = await makeUser();
    const market = await makeMarket();
    const res = await executeTrade({
      userId,
      marketId: market.id,
      outcomeIdx: 1,
      budget: pts(100),
    });
    expect(res.deltaShares > 0n).toBe(true);
    expect(res.cost <= pts(100)).toBe(true);
    await expectClean();
  });

  it("rejects insufficient balance", async () => {
    const userId = await makeUser();
    const market = await makeMarket({ bPoints: 1000 });
    // 1000-pt grant cannot cover a very large share purchase.
    await expect(
      executeTrade({ userId, marketId: market.id, outcomeIdx: 0, deltaShares: 100_000n * MICRO }),
    ).rejects.toThrow(new DomainError("INSUFFICIENT_BALANCE"));
    await expectClean();
  });

  it("rejects shorting", async () => {
    const userId = await makeUser();
    const market = await makeMarket();
    await expect(
      executeTrade({ userId, marketId: market.id, outcomeIdx: 0, deltaShares: -1n * MICRO }),
    ).rejects.toThrow(/cannot sell more shares than held/);
  });

  it("rejects trading a closed market", async () => {
    const userId = await makeUser();
    const market = await makeMarket({ closeAt: new Date(Date.now() - 1000) });
    await expect(
      executeTrade({ userId, marketId: market.id, outcomeIdx: 0, deltaShares: MICRO }),
    ).rejects.toThrow(new DomainError("MARKET_CLOSED"));
  });

  it("enforces the position cap across outcomes", async () => {
    const userId = await makeUser();
    const market = await makeMarket({ positionCapPoints: 300 });
    await executeTrade({ userId, marketId: market.id, outcomeIdx: 0, budget: pts(200) });
    await executeTrade({ userId, marketId: market.id, outcomeIdx: 1, budget: pts(99) });
    await expect(
      executeTrade({ userId, marketId: market.id, outcomeIdx: 0, deltaShares: 10n * MICRO }),
    ).rejects.toThrow(new DomainError("POSITION_CAP"));
    await expectClean();
  });

  it("enforces the 7-day new-account exposure cap", async () => {
    const userId = await makeUser();
    const market = await makeMarket(); // no market-level cap
    const prev = process.env.NEW_ACCOUNT_CAP_PTS;
    process.env.NEW_ACCOUNT_CAP_PTS = "50";
    try {
      await executeTrade({ userId, marketId: market.id, outcomeIdx: 0, budget: pts(40) });
      await expect(
        executeTrade({ userId, marketId: market.id, outcomeIdx: 0, budget: pts(20) }),
      ).rejects.toThrow(/new accounts are capped/);
    } finally {
      process.env.NEW_ACCOUNT_CAP_PTS = prev;
    }
    await expectClean();
  });

  it("NEW_ACCOUNT_CAP_PTS=0 disables the new-account cap", async () => {
    const userId = await makeUser();
    const market = await makeMarket(); // no market-level cap
    const prev = process.env.NEW_ACCOUNT_CAP_PTS;
    process.env.NEW_ACCOUNT_CAP_PTS = "0";
    try {
      // Well past the 250-pt default, on an account minutes old.
      await executeTrade({ userId, marketId: market.id, outcomeIdx: 0, budget: pts(600) });
    } finally {
      process.env.NEW_ACCOUNT_CAP_PTS = prev;
    }
    await expectClean();
  });

  it("enforces the maxCost slippage bound", async () => {
    const userId = await makeUser();
    const market = await makeMarket();
    await expect(
      executeTrade({
        userId,
        marketId: market.id,
        outcomeIdx: 0,
        deltaShares: 100n * MICRO,
        maxCost: 1n, // absurdly tight
      }),
    ).rejects.toThrow(new DomainError("PRICE_MOVED"));
  });

  it("50 concurrent trades on one market: version === trade count, invariants hold", async () => {
    const market = await makeMarket({ bPoints: 1000 });
    const userIds = await Promise.all(Array.from({ length: 10 }, () => makeUser()));

    const results = await Promise.allSettled(
      Array.from({ length: 50 }, (_, i) =>
        executeTrade({
          userId: userIds[i % userIds.length]!,
          marketId: market.id,
          outcomeIdx: i % 2,
          deltaShares: 5n * MICRO,
        }),
      ),
    );
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    expect(succeeded).toBe(50);

    const [state] = await db.select().from(lmsrState).where(eq(lmsrState.marketId, market.id));
    const tradeRows = await db.select().from(trades).where(eq(trades.marketId, market.id));
    expect(state!.version).toBe(tradeRows.length);
    expect(state!.version).toBe(50);
    await expectClean();
  }, 60_000);

  it("500-random-trade simulation stays consistent", async () => {
    const market = await makeMarket({ bPoints: 1000, outcomes: ["A", "B", "C", "D"] });
    const userIds = await Promise.all(Array.from({ length: 8 }, () => makeUser()));
    // Deterministic LCG so failures reproduce.
    let seed = 42;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000;

    let executed = 0;
    for (let i = 0; i < 500; i++) {
      const userId = userIds[Math.floor(rnd() * userIds.length)]!;
      const outcomeIdx = Math.floor(rnd() * 4);
      const sell = rnd() < 0.35;
      const size = BigInt(1 + Math.floor(rnd() * 20)) * MICRO;
      try {
        await executeTrade({
          userId,
          marketId: market.id,
          outcomeIdx,
          deltaShares: sell ? -size : size,
        });
        executed++;
      } catch (e) {
        // CANNOT_SHORT / INSUFFICIENT_BALANCE are legitimate rejections here.
        if (!(e instanceof DomainError)) throw e;
      }
    }
    expect(executed).toBeGreaterThan(300);
    const [state] = await db.select().from(lmsrState).where(eq(lmsrState.marketId, market.id));
    expect(state!.version).toBe(executed);
    await expectClean();
    // 500 sequential round trips; generous because the dev/test DB is remote
    // (SSH tunnel to the VPS), so each trade pays real network latency.
  }, 420_000);
});
