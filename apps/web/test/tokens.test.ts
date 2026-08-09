import { pts } from "@poporslop/lmsr";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/server/db/client";
import { companies, tokenState, users } from "../src/server/db/schema";
import { checkInvariants } from "../src/server/services/invariants";
import { DEFAULT_ALLOCATION_TOKENS, executeTokenTrade, listStartup } from "../src/server/services/tokens";
import { makeUser, resetDb } from "./helpers";

async function expectClean() {
  expect(await checkInvariants()).toEqual([]);
}

async function balance(userId: string): Promise<bigint> {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  return u!.pointsBalance;
}

let seq = 0;
async function makeCompany() {
  const [c] = await db
    .insert(companies)
    .values({ name: `TokenCo ${seq}`, slug: `tokenco-${seq++}`, jurisdiction: "US" })
    .returning();
  return c!;
}

describe("startup tokens (bonding curve)", () => {
  beforeEach(resetDb);

  it("listing launches the curve at the payment-derived price and mints the allocation", async () => {
    const company = await makeCompany();
    const res = await listStartup({ companyId: company.id, paymentUsd: 5000 });
    expect(res.p0).toBe(5_000_000n); // $5k → 5 pts launch price
    expect(res.allocation).toBe(DEFAULT_ALLOCATION_TOKENS);

    const [state] = await db.select().from(tokenState).where(eq(tokenState.companyId, company.id));
    expect(state!.supply).toBe(DEFAULT_ALLOCATION_TOKENS);
    // Double-listing is rejected.
    await expect(listStartup({ companyId: company.id, paymentUsd: 100 })).rejects.toThrow(/already listed/);
    await expectClean();
  });

  it("buy → price rises; sell everything → never profits; ledger stays balanced", async () => {
    const company = await makeCompany();
    await listStartup({ companyId: company.id, paymentUsd: 1000 }); // 1 pt launch
    const userId = await makeUser();

    const buy = await executeTokenTrade({ userId, companyId: company.id, budget: pts(100) });
    expect(buy.deltaTokens > 0n).toBe(true);
    const [afterBuy] = await db.select().from(tokenState).where(eq(tokenState.companyId, company.id));
    expect(afterBuy!.supply).toBe(DEFAULT_ALLOCATION_TOKENS + buy.deltaTokens);

    const sell = await executeTokenTrade({
      userId,
      companyId: company.id,
      deltaTokens: -buy.deltaTokens,
    });
    expect(-sell.cost <= buy.cost).toBe(true); // round trip never profits
    expect(await balance(userId)).toBe(pts(1000) - buy.cost - sell.cost);
    await expectClean();
  });

  it("startup account can dump its whole allocation without draining traders' points", async () => {
    const company = await makeCompany();
    const res = await listStartup({ companyId: company.id, paymentUsd: 2000 });
    const [c2] = await db.select().from(companies).where(eq(companies.id, company.id));
    const accountId = c2!.accountUserId!;

    // The allocation sell is fully covered by the treasury listing subsidy.
    const dump = await executeTokenTrade({
      userId: accountId,
      companyId: company.id,
      deltaTokens: -res.allocation,
    });
    expect(-dump.cost <= res.allocSubsidy).toBe(true);
    const [pool] = await db
      .select()
      .from(users)
      .where(eq(users.id, "00000000-0000-0000-0000-000000000004"));
    expect(pool!.pointsBalance >= 0n).toBe(true);
    await expectClean();
  });

  it("guards: no overselling, no trading unlisted startups, balance checked", async () => {
    const company = await makeCompany();
    const userId = await makeUser();
    await expect(
      executeTokenTrade({ userId, companyId: company.id, budget: pts(10) }),
    ).rejects.toThrow(/not listed/);

    await listStartup({ companyId: company.id, paymentUsd: 1000 });
    await expect(
      executeTokenTrade({ userId, companyId: company.id, deltaTokens: -1_000_000n }),
    ).rejects.toThrow(/cannot sell more tokens/);
    await expect(
      executeTokenTrade({ userId, companyId: company.id, deltaTokens: 5000n * 1_000_000n }),
    ).rejects.toThrow(/INSUFFICIENT_BALANCE/);
    await expectClean();
  });
});
