import { pricesMicro } from "@poporslop/lmsr";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client";
import {
  disputes,
  eventCompanyMatches,
  lmsrState,
  markets,
  positions,
  resolutionProposals,
} from "../../db/schema";
import { lockMarket } from "../../services/locks";
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

  /** Auto-resolver drafts awaiting human review. */
  draftProposals: adminProcedure.query(async () => {
    const rows = await db
      .select({
        id: resolutionProposals.id,
        marketId: resolutionProposals.marketId,
        outcomeIdx: resolutionProposals.outcomeIdx,
        evidence: resolutionProposals.evidence,
        proposer: resolutionProposals.proposer,
        ts: resolutionProposals.ts,
        title: markets.title,
        outcomes: markets.outcomes,
        status: markets.status,
      })
      .from(resolutionProposals)
      .innerJoin(markets, eq(markets.id, resolutionProposals.marketId))
      .where(eq(resolutionProposals.status, "draft"))
      .orderBy(desc(resolutionProposals.ts));
    return rows;
  }),

  /** Post a draft: lock the market if needed, then open the dispute window. */
  postDraft: adminProcedure
    .input(z.object({ proposalId: z.string().uuid(), disputeWindowHours: z.number().min(0).max(168).default(48) }))
    .mutation(async ({ ctx, input }) => {
      const [draft] = await db
        .select()
        .from(resolutionProposals)
        .where(eq(resolutionProposals.id, input.proposalId));
      if (!draft || draft.status !== "draft") throw new Error("draft not found");
      const [market] = await db.select().from(markets).where(eq(markets.id, draft.marketId));
      if (market?.status === "OPEN") {
        await db
          .update(markets)
          .set({ closeAt: new Date() })
          .where(and(eq(markets.id, draft.marketId), eq(markets.status, "OPEN")));
        await lockDueMarkets();
      }
      await postResolution({
        marketId: draft.marketId,
        outcomeIdx: draft.outcomeIdx,
        evidence: [],
        proposer: ctx.user.handle,
        disputeWindowHours: input.disputeWindowHours,
        fromProposalId: draft.id,
      });
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

  /**
   * Unflagged insider enforcement (spec §8): void the trader's positions on
   * one market via forced zero-cost sells (keeps the tape public and the
   * positions↔trades recompute invariant intact — the AMM keeps their cost,
   * swept to the treasury at resolution) and ban the account.
   */
  voidAndBan: adminProcedure
    .input(z.object({ userId: z.string().uuid(), marketId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await db.transaction(async (tx) => {
        await lockMarket(tx, input.marketId);
        const [market] = await tx.select().from(markets).where(eq(markets.id, input.marketId));
        const [state] = await tx.select().from(lmsrState).where(eq(lmsrState.marketId, input.marketId));
        const pm = market && state ? pricesMicro({ q: state.q, b: market.b }) : [];
        const pmLiteral = `{${pm.join(",")}}`;

        const held = await tx
          .select()
          .from(positions)
          .where(and(eq(positions.userId, input.userId), eq(positions.marketId, input.marketId)));
        for (const pos of held) {
          if (pos.shares === 0n) continue;
          // Forced sale at price zero: shares vanish, cost stays spent (the
          // points remain in the AMM pool and land in the treasury at sweep).
          // cost = 0 keeps trades ≡ ledger flow; q is untouched on purpose.
          await tx.execute(sql`
            INSERT INTO trades (user_id, market_id, outcome_idx, delta_shares, cost,
                                p_before, p_after, self_flagged)
            SELECT ${input.userId}, ${input.marketId}, ${pos.outcomeIdx},
                   ${-pos.shares}, 0,
                   ${pmLiteral}::integer[], ${pmLiteral}::integer[], false
          `);
          await tx
            .update(positions)
            .set({ shares: 0n })
            .where(
              and(
                eq(positions.userId, input.userId),
                eq(positions.marketId, input.marketId),
                eq(positions.outcomeIdx, pos.outcomeIdx),
              ),
            );
        }
        await tx.execute(
          sql`UPDATE users SET flags = flags || '{"banned": true}' WHERE id = ${input.userId}`,
        );
      });
    }),

  /** Recent oracle events with their match state — the W1 review queue. */
  oracleEvents: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }))
    .query(async ({ input }) => {
      const rows = await db.execute<{
        id: string;
        source: string;
        external_ref: string;
        raw_url: string | null;
        parsed: Record<string, unknown>;
        fetched_at: Date;
        company_id: string | null;
        company_name: string | null;
        confidence: number | null;
        method: string | null;
        match_status: string | null;
      }>(sql`
        SELECT e.id, e.source, e.external_ref, e.raw_url, e.parsed, e.fetched_at,
               m.company_id, c.name AS company_name, m.confidence, m.method,
               m.status AS match_status
        FROM oracle_events e
        LEFT JOIN event_company_matches m ON m.oracle_event_id = e.id
        LEFT JOIN companies c ON c.id = m.company_id
        ORDER BY (m.status = 'pending') DESC NULLS LAST, e.fetched_at DESC
        LIMIT ${input.limit}
      `);
      return rows.rows;
    }),

  setMatchStatus: adminProcedure
    .input(
      z.object({
        oracleEventId: z.string().uuid(),
        companyId: z.string().uuid(),
        status: z.enum(["confirmed", "rejected"]),
      }),
    )
    .mutation(async ({ input }) => {
      await db
        .update(eventCompanyMatches)
        .set({ status: input.status })
        .where(
          and(
            eq(eventCompanyMatches.oracleEventId, input.oracleEventId),
            eq(eventCompanyMatches.companyId, input.companyId),
          ),
        );
    }),
});

/** Non-admin dispute filing lives here to keep resolution imports together. */
export const disputeRouter = router({
  file: authedProcedure
    .input(z.object({ marketId: z.string().uuid(), reason: z.string().min(5).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      return fileDisputeSvc({ marketId: input.marketId, userId: ctx.user.id, reason: input.reason });
    }),
});
