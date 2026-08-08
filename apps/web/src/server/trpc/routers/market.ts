import { type LmsrState as EngineState, pricesMicro } from "@poporslop/lmsr";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client";
import { lmsrState, markets, resolutionProposals, trades, users } from "../../db/schema";
import { publicProcedure, router } from "../trpc";

export function toEngine(q: bigint[], b: bigint): EngineState {
  return { q, b };
}

const marketSummary = (m: typeof markets.$inferSelect, q: bigint[] | null) => ({
  id: m.id,
  slug: m.slug,
  title: m.title,
  type: m.type,
  outcomes: m.outcomes,
  status: m.status,
  closeAt: m.closeAt,
  bPoints: Number(m.b / 1_000_000n),
  iClass: m.iClass,
  mClass: m.mClass,
  positionCap: m.positionCap,
  resolvedOutcome: m.resolvedOutcome,
  proposedAt: m.proposedAt,
  disputeDeadline: m.disputeDeadline,
  criteriaMd: m.criteriaMd,
  criteriaHash: m.criteriaHash,
  pricesMicro: q ? pricesMicro(toEngine(q, m.b)) : null,
});

export const marketRouter = router({
  list: publicProcedure.query(async () => {
    const rows = await db
      .select({ market: markets, q: lmsrState.q })
      .from(markets)
      .leftJoin(lmsrState, eq(lmsrState.marketId, markets.id))
      .orderBy(desc(markets.createdAt));
    return rows.map((r) => marketSummary(r.market, r.q));
  }),

  bySlug: publicProcedure.input(z.object({ slug: z.string() })).query(async ({ input }) => {
    const rows = await db
      .select({ market: markets, q: lmsrState.q })
      .from(markets)
      .leftJoin(lmsrState, eq(lmsrState.marketId, markets.id))
      .where(eq(markets.slug, input.slug));
    const row = rows[0];
    if (!row) return null;
    return marketSummary(row.market, row.q);
  }),

  /** Public pseudonymous trade tape (spec §8: sunlight > moderation). */
  tape: publicProcedure
    .input(z.object({ marketId: z.string().uuid(), limit: z.number().int().min(1).max(200).default(50) }))
    .query(async ({ input }) => {
      const rows = await db
        .select({
          id: trades.id,
          handle: users.handle,
          team: users.team,
          outcomeIdx: trades.outcomeIdx,
          deltaShares: trades.deltaShares,
          cost: trades.cost,
          selfFlagged: trades.selfFlagged,
          ts: trades.ts,
        })
        .from(trades)
        .innerJoin(users, eq(users.id, trades.userId))
        .where(eq(trades.marketId, input.marketId))
        .orderBy(desc(trades.ts), desc(trades.id))
        .limit(input.limit);
      return rows;
    }),

  /** Price history for the chart: p_after per executed trade. */
  history: publicProcedure
    .input(z.object({ marketId: z.string().uuid(), limit: z.number().int().min(10).max(1000).default(500) }))
    .query(async ({ input }) => {
      const rows = await db
        .select({ ts: trades.ts, pAfter: trades.pAfter })
        .from(trades)
        .where(eq(trades.marketId, input.marketId))
        .orderBy(desc(trades.ts), desc(trades.id))
        .limit(input.limit);
      return rows.reverse();
    }),

  /** Recent trades across all markets — the /live ticker. */
  ticker: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(30) }))
    .query(async ({ input }) => {
      const rows = await db
        .select({
          id: trades.id,
          handle: users.handle,
          team: users.team,
          marketId: trades.marketId,
          outcomeIdx: trades.outcomeIdx,
          deltaShares: trades.deltaShares,
          cost: trades.cost,
          selfFlagged: trades.selfFlagged,
          ts: trades.ts,
        })
        .from(trades)
        .innerJoin(users, eq(users.id, trades.userId))
        .orderBy(desc(trades.ts), desc(trades.id))
        .limit(input.limit);
      if (rows.length === 0) return [];
      const marketIds = [...new Set(rows.map((r) => r.marketId))];
      const ms = await db
        .select({ id: markets.id, slug: markets.slug, title: markets.title, outcomes: markets.outcomes })
        .from(markets)
        .where(inArray(markets.id, marketIds));
      const byId = new Map(ms.map((m) => [m.id, m]));
      return rows.map((r) => ({ ...r, market: byId.get(r.marketId) ?? null }));
    }),

  /** Posted resolution proposals + evidence bundles — public (spec: evidence tab). */
  proposals: publicProcedure
    .input(z.object({ marketId: z.string().uuid() }))
    .query(async ({ input }) => {
      const rows = await db
        .select({
          id: resolutionProposals.id,
          outcomeIdx: resolutionProposals.outcomeIdx,
          evidence: resolutionProposals.evidence,
          proposer: resolutionProposals.proposer,
          status: resolutionProposals.status,
          ts: resolutionProposals.ts,
        })
        .from(resolutionProposals)
        .where(eq(resolutionProposals.marketId, input.marketId))
        .orderBy(desc(resolutionProposals.ts));
      return rows.filter((r) => r.status !== "draft");
    }),

  stats: publicProcedure.query(async () => {
    const [row] = await db.execute<{ traders: bigint; trades: bigint }>(
      sql`SELECT (SELECT COUNT(DISTINCT user_id) FROM trades)::bigint AS traders,
                 (SELECT COUNT(*) FROM trades)::bigint AS trades`,
    ).then((r) => r.rows);
    return { traders: Number(row?.traders ?? 0n), trades: Number(row?.trades ?? 0n) };
  }),
});
