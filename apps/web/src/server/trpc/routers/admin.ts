import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client";
import { disputes, markets, resolutionProposals } from "../../db/schema";
import { checkInvariants } from "../../services/invariants";
import { createMarket } from "../../services/markets";
import {
  fileDispute as fileDisputeSvc,
  lockDueMarkets,
  naRefund,
  postResolution,
  resolveDispute,
  resolveNow,
} from "../../services/resolution";
import { adminProcedure, authedProcedure, router } from "../trpc";

const createMarketInput = z.object({
  slug: z
    .string()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9-]+$/),
  title: z.string().min(3).max(200),
  type: z.enum([
    "COHORT_INDEX",
    "SURVIVAL",
    "REG_EVENT",
    "EXIT",
    "FUNDING_BINARY",
    "FUNDING_BUCKET",
    "INVESTOR_IN",
    "MILESTONE_PUBLIC",
    "EVENT_DEMO",
  ]),
  outcomes: z.array(z.string().min(1).max(120)).min(2).max(64),
  criteriaMd: z.string().min(10),
  bPoints: z.union([z.literal(100), z.literal(250), z.literal(1000)]),
  closeAt: z.date(),
  priors: z.array(z.number().positive()).optional(),
  iClass: z.number().int().min(0).max(3).optional(),
  mClass: z.number().int().min(0).max(2).optional(),
  positionCapPoints: z.number().int().positive().optional(),
});

const evidenceInput = z.array(
  z.object({
    source: z.string(),
    externalRef: z.string().optional(),
    url: z.string().url().optional(),
    summary: z.string(),
  }),
);

export const adminRouter = router({
  createMarket: adminProcedure.input(createMarketInput).mutation(async ({ input }) => {
    return createMarket(input);
  }),

  /**
   * Team import: newline/CSV paste → one categorical market, <30s from paste
   * to live (spec §12.1 / §18 mitigation).
   */
  importTeamsMarket: adminProcedure
    .input(
      z.object({
        title: z.string().min(3),
        slug: z
          .string()
          .min(3)
          .regex(/^[a-z0-9-]+$/),
        teamsRaw: z.string().min(1),
        closeAt: z.date(),
        positionCapPoints: z.number().int().positive().default(300),
      }),
    )
    .mutation(async ({ input }) => {
      const teams = [
        ...new Set(
          input.teamsRaw
            .split(/[\n,;]+/)
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      ];
      if (teams.length < 2) throw new Error("need at least 2 teams");
      return createMarket({
        slug: input.slug,
        title: input.title,
        type: "EVENT_DEMO",
        outcomes: teams,
        criteriaMd: `Resolves to the team announced by the organizers. The organizers' decision is final; no dispute window.`,
        bPoints: 1000,
        closeAt: input.closeAt,
        positionCapPoints: input.positionCapPoints,
      });
    }),

  /** Force-lock a market now (also run by the cron). */
  lockMarket: adminProcedure
    .input(z.object({ marketId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await db
        .update(markets)
        .set({ closeAt: new Date() })
        .where(and(eq(markets.id, input.marketId), eq(markets.status, "OPEN")));
      await lockDueMarkets();
    }),

  /** W0 stage mode: propose + finalize in one click (window = 0). */
  resolveNow: adminProcedure
    .input(z.object({ marketId: z.string().uuid(), outcomeIdx: z.number().int().min(0), evidence: evidenceInput }))
    .mutation(async ({ ctx, input }) => {
      await resolveNow({ ...input, proposer: ctx.user.handle });
    }),

  /** v1 mode: post the proposal, open the 48h dispute window. */
  postResolution: adminProcedure
    .input(
      z.object({
        marketId: z.string().uuid(),
        outcomeIdx: z.number().int().min(0),
        evidence: evidenceInput,
        disputeWindowHours: z.number().min(0).max(168).default(48),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await postResolution({ ...input, proposer: ctx.user.handle });
    }),

  naRefund: adminProcedure
    .input(z.object({ marketId: z.string().uuid() }))
    .mutation(async ({ input }) => naRefund(input.marketId)),

  resolveDispute: adminProcedure
    .input(
      z.object({
        disputeId: z.string().uuid(),
        upheld: z.boolean(),
        correctedOutcomeIdx: z.number().int().min(0).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await resolveDispute({ ...input, councilUserId: ctx.user.id });
    }),

  disputes: adminProcedure.query(async () => {
    return db.select().from(disputes).orderBy(desc(disputes.createdAt)).limit(100);
  }),

  proposals: adminProcedure
    .input(z.object({ marketId: z.string().uuid() }))
    .query(async ({ input }) => {
      return db
        .select()
        .from(resolutionProposals)
        .where(eq(resolutionProposals.marketId, input.marketId))
        .orderBy(desc(resolutionProposals.ts));
    }),

  /** The on-stage invariants panel (spec §12.6 acceptance ③). */
  invariants: adminProcedure.query(async () => checkInvariants()),
});

/** Non-admin dispute filing lives here to keep resolution imports together. */
export const disputeRouter = router({
  file: authedProcedure
    .input(z.object({ marketId: z.string().uuid(), reason: z.string().min(5).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      return fileDisputeSvc({ marketId: input.marketId, userId: ctx.user.id, reason: input.reason });
    }),
});
