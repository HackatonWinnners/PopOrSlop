import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { type Tx, db } from "../db/client";
import { questCompletions, questStarts, quests } from "../db/schema";
import { DomainError } from "./errors";
import { SYSTEM, postEntries } from "./ledger";

/**
 * Quests (growth mechanic): complete a task, earn points.
 *
 * Verification kinds:
 *  - auto:   an internal fact we can check ourselves (first trade, verified email…)
 *  - code:   redemption code shown by the external app/partner after the task
 *  - manual: user submits proof, admin approves in the console
 *
 * Grants are balanced ledger groups (treasury → user, QUEST_REWARD) and
 * exactly-once per (quest, user) via the unique completion row: the reward is
 * posted in the same transaction that inserts/approves the completion.
 */

export type AutoRule = "first_trade" | "email_verified" | "traded_3_markets";

export function hashQuestCode(code: string): string {
  return createHash("sha256").update(code.trim().toLowerCase()).digest("hex");
}

/**
 * Opaque per-(user, quest) handle sent to the partner as a deep-link payload.
 *
 * Derived, not random, so the same user always gets the same one and we can
 * recognise it in a postback without storing a lookup. Salted with
 * SESSION_SECRET so it can't be computed from a user id, and truncated to fit
 * Telegram's 64-char `?start=` limit.
 */
export function questPayload(questId: string, userId: string): string {
  return createHash("sha256")
    .update(`${questId}:${userId}:${process.env.SESSION_SECRET ?? "dev"}`)
    .digest("base64url")
    .slice(0, 32);
}

/**
 * Record that a user followed a quest's outbound link, and hand back where to
 * send them. Idempotent — re-opening the link doesn't reset anything.
 *
 * This is a weak signal by construction: it proves they left, not that they
 * did the task. It exists so a partner quest can't be claimed by someone who
 * never opened it, and so the payload is already in place when the partner
 * can confirm the real thing.
 */
export async function startQuest(userId: string, questSlug: string): Promise<string> {
  const [quest] = await db.select().from(quests).where(eq(quests.slug, questSlug));
  if (!quest || !quest.active) throw new DomainError("BAD_STATE", "quest not found or inactive");
  if (!quest.url) throw new DomainError("BAD_STATE", "quest has no link to follow");

  const payload = questPayload(quest.id, userId);
  await db
    .insert(questStarts)
    .values({ questId: quest.id, userId, payload })
    .onConflictDoNothing();

  // Telegram passes ?start=… straight to the bot, which is how Facestic will
  // eventually tie a sticker back to a trader. Harmless on any other URL.
  const url = new URL(quest.url);
  if (!url.searchParams.has("start")) url.searchParams.set("start", payload);
  return url.toString();
}

async function checkAutoRule(tx: Tx, rule: string, userId: string): Promise<boolean> {
  switch (rule) {
    case "first_trade": {
      const r = await tx.execute(sql`SELECT 1 FROM trades WHERE user_id = ${userId} LIMIT 1`);
      return r.rows.length > 0;
    }
    // "email_set" is the pre-verification name, still on rows seeded before
    // verification existed; both require a *proven* address so the reward
    // can't be farmed with a typed-in fake.
    case "email_set":
    case "email_verified": {
      const r = await tx.execute(
        sql`SELECT 1 FROM users WHERE id = ${userId} AND email_verified_at IS NOT NULL`,
      );
      return r.rows.length > 0;
    }
    case "traded_3_markets": {
      const r = await tx.execute<{ n: bigint }>(
        sql`SELECT COUNT(DISTINCT market_id)::bigint AS n FROM trades WHERE user_id = ${userId}`,
      );
      return Number(r.rows[0]?.n ?? 0n) >= 3;
    }
    default:
      throw new DomainError("BAD_STATE", `unknown auto rule: ${rule}`);
  }
}

async function grantReward(tx: Tx, questId: string, userId: string, reward: bigint): Promise<void> {
  await postEntries(tx, [
    { userId: SYSTEM.houseTreasury, delta: -reward, reason: "QUEST_REWARD", refId: questId },
    { userId, delta: reward, reason: "QUEST_REWARD", refId: questId },
  ]);
}

/**
 * Claim a quest. auto/code kinds verify and pay immediately; manual kind
 * records a pending submission for admin review. Duplicate claims are
 * rejected by the unique (quest, user) row — including re-claims after a
 * rejection (one shot per quest, no proof-fishing).
 */
export async function claimQuest(opts: {
  userId: string;
  questSlug: string;
  code?: string;
  proof?: string;
}): Promise<{ status: "approved" | "pending" }> {
  return db.transaction(async (tx) => {
    const [quest] = await tx.select().from(quests).where(eq(quests.slug, opts.questSlug));
    if (!quest || !quest.active) throw new DomainError("BAD_STATE", "quest not found or inactive");

    if (quest.requiresStart) {
      const [started] = await tx
        .select({ id: questStarts.id })
        .from(questStarts)
        .where(and(eq(questStarts.questId, quest.id), eq(questStarts.userId, opts.userId)));
      if (!started) {
        throw new DomainError("BAD_STATE", "open the task link first, then claim");
      }
    }

    let status: "approved" | "pending";
    if (quest.kind === "auto") {
      if (!(await checkAutoRule(tx, quest.rule ?? "", opts.userId))) {
        throw new DomainError("BAD_STATE", "quest requirement not met yet");
      }
      status = "approved";
    } else if (quest.kind === "code") {
      if (!opts.code || !quest.codeHash || hashQuestCode(opts.code) !== quest.codeHash) {
        throw new DomainError("NOT_AUTHORIZED", "wrong code");
      }
      status = "approved";
    } else if (quest.kind === "manual") {
      // Timed quests take the claim at face value anyway, so demanding a
      // written proof would be theatre — and friction on the one path we
      // actively want people to walk.
      if (quest.autoApproveAfterS === null && (!opts.proof || opts.proof.trim().length < 5)) {
        throw new DomainError("BAD_STATE", "please describe how you completed the quest (≥ 5 chars)");
      }
      status = "pending";
    } else {
      throw new DomainError("BAD_STATE", `unknown quest kind ${quest.kind}`);
    }

    const inserted = await tx
      .insert(questCompletions)
      .values({ questId: quest.id, userId: opts.userId, status, proof: opts.proof })
      .onConflictDoNothing()
      .returning({ id: questCompletions.id });
    if (inserted.length === 0) {
      throw new DomainError("BAD_STATE", "quest already claimed");
    }

    if (status === "approved") await grantReward(tx, quest.id, opts.userId, quest.reward);
    return { status };
  });
}

/**
 * Approve pending claims on timed quests whose delay has elapsed.
 *
 * Idempotent and safe to run concurrently: the UPDATE is guarded on
 * `status = 'pending'` and only rows it actually flipped come back, so a
 * reward is granted exactly once even if the cron and a page load race.
 *
 * `userId` scopes the sweep to one person — the cheap path for a page load.
 * Omit it for the cron, which sweeps everyone.
 */
export async function sweepTimedQuestApprovals(userId?: string): Promise<number> {
  return db.transaction(async (tx) => {
    const due = await tx.execute<{ id: string; quest_id: string; user_id: string; reward: string }>(sql`
      UPDATE quest_completions c
         SET status = 'approved', reviewed_at = now()
        FROM quests q
       WHERE q.id = c.quest_id
         AND c.status = 'pending'
         AND q.auto_approve_after_s IS NOT NULL
         AND c.created_at + make_interval(secs => q.auto_approve_after_s) <= now()
         ${userId ? sql`AND c.user_id = ${userId}` : sql``}
      RETURNING c.id, c.quest_id, c.user_id, q.reward::text AS reward
    `);
    for (const row of due.rows) {
      await grantReward(tx, row.quest_id, row.user_id, BigInt(row.reward));
    }
    return due.rows.length;
  });
}

/** Admin review of a manual submission. Approval grants in the same tx. */
export async function reviewQuestSubmission(opts: {
  completionId: string;
  approve: boolean;
  reviewerId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(questCompletions)
      .set({
        status: opts.approve ? "approved" : "rejected",
        reviewedBy: opts.reviewerId,
        reviewedAt: new Date(),
      })
      .where(and(eq(questCompletions.id, opts.completionId), eq(questCompletions.status, "pending")))
      .returning({ questId: questCompletions.questId, userId: questCompletions.userId });
    const row = updated[0];
    if (!row) throw new DomainError("BAD_STATE", "submission not found or already reviewed");
    if (opts.approve) {
      const [quest] = await tx.select().from(quests).where(eq(quests.id, row.questId));
      await grantReward(tx, row.questId, row.userId, quest!.reward);
    }
  });
}
