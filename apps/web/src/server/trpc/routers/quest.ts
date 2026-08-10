import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client";
import { questCompletions, quests, users } from "../../db/schema";
import { claimQuest, hashQuestCode, reviewQuestSubmission } from "../../services/quests";
import { adminProcedure, authedProcedure, publicProcedure, router } from "../trpc";

export const questRouter = router({
  /** Active quests, annotated with the caller's completion status. */
  list: publicProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select()
      .from(quests)
      .where(eq(quests.active, true))
      .orderBy(desc(quests.reward));
    let mine = new Map<string, string>();
    if (ctx.user) {
      const completions = await db
        .select({ questId: questCompletions.questId, status: questCompletions.status })
        .from(questCompletions)
        .where(eq(questCompletions.userId, ctx.user.id));
      mine = new Map(completions.map((c) => [c.questId, c.status]));
    }
    return rows.map((q) => ({
      slug: q.slug,
      title: q.title,
      description: q.description,
      url: q.url,
      kind: q.kind as "auto" | "code" | "manual",
      reward: q.reward,
      myStatus: (mine.get(q.id) ?? null) as "pending" | "approved" | "rejected" | null,
    }));
  }),

  claim: authedProcedure
    .input(
      z.object({
        questSlug: z.string(),
        code: z.string().max(120).optional(),
        proof: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return claimQuest({ userId: ctx.user.id, ...input });
    }),

  // ── Admin ──
  create: adminProcedure
    .input(
      z.object({
        slug: z
          .string()
          .min(3)
          .max(60)
          .regex(/^[a-z0-9-]+$/),
        title: z.string().min(3).max(160),
        description: z.string().min(5).max(1000),
        url: z.string().url().optional(),
        kind: z.enum(["auto", "code", "manual"]),
        rule: z.enum(["first_trade", "email_verified", "traded_3_markets"]).optional(),
        code: z.string().min(4).max(120).optional(),
        rewardPoints: z.number().int().min(1).max(100_000),
      }),
    )
    .mutation(async ({ input }) => {
      if (input.kind === "auto" && !input.rule) throw new Error("auto quests need a rule");
      if (input.kind === "code" && !input.code) throw new Error("code quests need a code");
      await db.insert(quests).values({
        slug: input.slug,
        title: input.title,
        description: input.description,
        url: input.url,
        kind: input.kind,
        rule: input.kind === "auto" ? input.rule : null,
        codeHash: input.kind === "code" ? hashQuestCode(input.code!) : null,
        reward: BigInt(input.rewardPoints) * 1_000_000n,
      });
    }),

  setActive: adminProcedure
    .input(z.object({ slug: z.string(), active: z.boolean() }))
    .mutation(async ({ input }) => {
      await db.update(quests).set({ active: input.active }).where(eq(quests.slug, input.slug));
    }),

  submissions: adminProcedure.query(async () => {
    const rows = await db
      .select({
        id: questCompletions.id,
        status: questCompletions.status,
        proof: questCompletions.proof,
        createdAt: questCompletions.createdAt,
        handle: users.handle,
        questTitle: quests.title,
        reward: quests.reward,
      })
      .from(questCompletions)
      .innerJoin(users, eq(users.id, questCompletions.userId))
      .innerJoin(quests, eq(quests.id, questCompletions.questId))
      .orderBy(sql`(${questCompletions.status} = 'pending') DESC`, desc(questCompletions.createdAt))
      .limit(100);
    return rows;
  }),

  review: adminProcedure
    .input(z.object({ completionId: z.string().uuid(), approve: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await reviewQuestSubmission({ ...input, reviewerId: ctx.user.id });
    }),
});
