import { MICRO, pts } from "@poporslop/lmsr";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/server/db/client";
import { quests, users } from "../src/server/db/schema";
import { checkInvariants } from "../src/server/services/invariants";
import {
  claimQuest,
  hashQuestCode,
  reviewQuestSubmission,
  sweepTimedQuestApprovals,
} from "../src/server/services/quests";
import { executeTrade } from "../src/server/services/trade";
import { makeMarket, makeUser, resetDb } from "./helpers";

async function expectClean() {
  expect(await checkInvariants()).toEqual([]);
}

async function balance(userId: string): Promise<bigint> {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  return u!.pointsBalance;
}

async function makeQuest(overrides: Partial<typeof quests.$inferInsert> & { slug: string }) {
  await db.insert(quests).values({
    title: overrides.slug,
    description: "test quest",
    kind: "manual",
    reward: pts(100),
    ...overrides,
  });
}

describe("quests", () => {
  beforeEach(resetDb);

  it("auto quest: claim succeeds only once the rule is met, exactly once", async () => {
    const userId = await makeUser();
    await makeQuest({ slug: "first-trade", kind: "auto", rule: "first_trade", reward: pts(50) });

    await expect(claimQuest({ userId, questSlug: "first-trade" })).rejects.toThrow(/not met/);

    const market = await makeMarket();
    await executeTrade({ userId, marketId: market.id, outcomeIdx: 0, deltaShares: MICRO });
    const before = await balance(userId);
    expect((await claimQuest({ userId, questSlug: "first-trade" })).status).toBe("approved");
    expect(await balance(userId)).toBe(before + pts(50));

    await expect(claimQuest({ userId, questSlug: "first-trade" })).rejects.toThrow(/already claimed/);
    expect(await balance(userId)).toBe(before + pts(50));
    await expectClean();
  });

  it("code quest: correct code pays instantly, wrong code doesn't burn the attempt", async () => {
    const userId = await makeUser();
    await makeQuest({
      slug: "partner-signup",
      kind: "code",
      codeHash: hashQuestCode("POPS-SECRET"),
      reward: pts(1000),
    });

    await expect(
      claimQuest({ userId, questSlug: "partner-signup", code: "wrong" }),
    ).rejects.toThrow(/wrong code/);

    // Codes are case/whitespace-insensitive; a wrong attempt doesn't lock you out.
    expect(
      (await claimQuest({ userId, questSlug: "partner-signup", code: "  pops-secret " })).status,
    ).toBe("approved");
    expect(await balance(userId)).toBe(pts(2000));
    await expectClean();
  });

  it("manual quest: pending until admin approves; approval pays once; rejection pays nothing", async () => {
    const alice = await makeUser();
    const bob = await makeUser();
    const admin = await makeUser();
    await makeQuest({ slug: "share-post", kind: "manual", reward: pts(250) });

    expect(
      (await claimQuest({ userId: alice, questSlug: "share-post", proof: "https://x.com/a/123" })).status,
    ).toBe("pending");
    expect(await balance(alice)).toBe(pts(1000)); // nothing until review

    const [aliceRow] = await db
      .execute<{ id: string }>(sql`SELECT id FROM quest_completions WHERE user_id = ${alice}`)
      .then((r) => r.rows);
    await reviewQuestSubmission({ completionId: aliceRow!.id, approve: true, reviewerId: admin });
    expect(await balance(alice)).toBe(pts(1250));
    // Double review is rejected.
    await expect(
      reviewQuestSubmission({ completionId: aliceRow!.id, approve: true, reviewerId: admin }),
    ).rejects.toThrow(/already reviewed/);
    expect(await balance(alice)).toBe(pts(1250));

    await claimQuest({ userId: bob, questSlug: "share-post", proof: "trust me" });
    const [bobRow] = await db
      .execute<{ id: string }>(sql`SELECT id FROM quest_completions WHERE user_id = ${bob}`)
      .then((r) => r.rows);
    await reviewQuestSubmission({ completionId: bobRow!.id, approve: false, reviewerId: admin });
    expect(await balance(bob)).toBe(pts(1000));
    // One shot per quest: no resubmission after rejection.
    await expect(
      claimQuest({ userId: bob, questSlug: "share-post", proof: "for real this time" }),
    ).rejects.toThrow(/already claimed/);
    await expectClean();
  });

  it("inactive quests cannot be claimed", async () => {
    const userId = await makeUser();
    await makeQuest({ slug: "old-quest", kind: "manual", reward: pts(10), active: false });
    await expect(
      claimQuest({ userId, questSlug: "old-quest", proof: "hello there" }),
    ).rejects.toThrow(/not found or inactive/);
  });
});

describe("timed quests (partner apps with no postback yet)", () => {
  beforeEach(resetDb);

  it("stays pending until the delay elapses, then pays exactly once", async () => {
    const userId = await makeUser();
    await makeQuest({
      slug: "facestic-sticker",
      kind: "manual",
      autoApproveAfterS: 300,
      reward: pts(500),
    });
    const before = await balance(userId);

    // No proof required — a timer can't read one anyway.
    expect(await claimQuest({ userId, questSlug: "facestic-sticker" })).toEqual({
      status: "pending",
    });
    expect(await balance(userId)).toBe(before);

    // Not due yet.
    expect(await sweepTimedQuestApprovals()).toBe(0);
    expect(await balance(userId)).toBe(before);

    // Backdate the claim past the delay rather than waiting five minutes.
    await db.execute(sql`UPDATE quest_completions SET created_at = now() - interval '6 minutes'`);

    expect(await sweepTimedQuestApprovals()).toBe(1);
    expect(await balance(userId)).toBe(before + pts(500));

    // Re-running must not pay again — the guard is status='pending'.
    expect(await sweepTimedQuestApprovals()).toBe(0);
    expect(await balance(userId)).toBe(before + pts(500));
    await expectClean();
  });

  it("leaves untimed manual submissions for a human", async () => {
    const userId = await makeUser();
    await makeQuest({ slug: "spread-the-word", kind: "manual", reward: pts(250) });
    await claimQuest({ userId, questSlug: "spread-the-word", proof: "https://x.com/post/1" });
    await db.execute(sql`UPDATE quest_completions SET created_at = now() - interval '30 days'`);
    expect(await sweepTimedQuestApprovals()).toBe(0);
    await expectClean();
  });
});
