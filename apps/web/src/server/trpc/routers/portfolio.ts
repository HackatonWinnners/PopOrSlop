import { pricesMicro } from "@poporslop/lmsr";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client";
import { lmsrState, markets, positions, users } from "../../db/schema";
import { authedProcedure, publicProcedure, router } from "../trpc";

/**
 * Below a thousandth of a share a position is rounding dust, not a holding —
 * it marks to under 0.001 pts and can't be meaningfully sold. Older sells
 * left some behind by truncating "sell all"; that's fixed at the source, but
 * the existing crumbs shouldn't haunt anyone's portfolio.
 *
 * Display only. The rows stay in the table, still reconcile against trades,
 * and still pay out at resolution.
 */
const DUST_SHARES = 1000n;

export const portfolioRouter = router({
  mine: authedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select({
        marketId: positions.marketId,
        outcomeIdx: positions.outcomeIdx,
        shares: positions.shares,
        costBasis: positions.costBasis,
        slug: markets.slug,
        title: markets.title,
        outcomes: markets.outcomes,
        status: markets.status,
        b: markets.b,
        q: lmsrState.q,
      })
      .from(positions)
      .innerJoin(markets, eq(markets.id, positions.marketId))
      .leftJoin(lmsrState, eq(lmsrState.marketId, positions.marketId))
      .where(and(eq(positions.userId, ctx.user.id), gt(positions.shares, DUST_SHARES)));

    const withMark = rows.map((r) => {
      const pm = r.q ? pricesMicro({ q: r.q, b: r.b }) : null;
      const priceMicro = pm ? pm[r.outcomeIdx]! : null;
      // MTM value in µpts: shares (µshares) × price (µprob) / 1e6.
      const markValue = priceMicro !== null ? (r.shares * BigInt(priceMicro)) / 1_000_000n : null;
      return {
        marketId: r.marketId,
        slug: r.slug,
        title: r.title,
        status: r.status,
        outcomeIdx: r.outcomeIdx,
        outcome: r.outcomes[r.outcomeIdx] ?? String(r.outcomeIdx),
        shares: r.shares,
        costBasis: r.costBasis,
        priceMicro,
        markValue,
      };
    });

    return {
      balance: ctx.user.pointsBalance,
      positions: withMark,
    };
  }),

  /**
   * Calibration profile (spec §6.3): buys on RESOLVED markets, bucketed by
   * entry price vs outcome; Brier score share-weighted. M2 (manipulable)
   * markets are excluded from scoring.
   */
  calibration: publicProcedure
    .input(z.object({ handle: z.string() }))
    .query(async ({ input }) => {
      const [user] = await db
        .select({ id: users.id, handle: users.handle, team: users.team, createdAt: users.createdAt })
        .from(users)
        .where(eq(users.handle, input.handle));
      if (!user) return null;

      const rows = await db.execute<{ price_micro: number; won: number; weight: bigint }>(sql`
        SELECT (t.p_after)[t.outcome_idx + 1] AS price_micro,
               (m.resolved_outcome = t.outcome_idx)::int AS won,
               t.delta_shares AS weight
        FROM trades t
        JOIN markets m ON m.id = t.market_id
        WHERE t.user_id = ${user.id}
          AND m.status = 'RESOLVED'
          AND m.m_class < 2
          AND t.delta_shares > 0
      `);

      let wSum = 0;
      let brierSum = 0;
      const buckets = Array.from({ length: 10 }, () => ({ w: 0, pSum: 0, wonSum: 0 }));
      for (const r of rows.rows) {
        const p = r.price_micro / 1_000_000;
        const w = Number(r.weight) / 1_000_000;
        wSum += w;
        brierSum += w * (p - r.won) ** 2;
        const b = Math.min(9, Math.floor(p * 10));
        buckets[b]!.w += w;
        buckets[b]!.pSum += w * p;
        buckets[b]!.wonSum += w * r.won;
      }

      return {
        handle: user.handle,
        team: user.team,
        since: user.createdAt,
        scoredTrades: rows.rows.length,
        brier: wSum > 0 ? brierSum / wSum : null,
        buckets: buckets.map((b, i) => ({
          range: `${i * 10}–${i * 10 + 10}%`,
          weight: b.w,
          avgPredicted: b.w > 0 ? b.pSum / b.w : null,
          actualWinRate: b.w > 0 ? b.wonSum / b.w : null,
        })),
      };
    }),

  /**
   * Two leaderboards (spec §6.3): realized P&L from the ledger
   * (TRADE + PAYOUT + NA_REFUND flows) all-time and over 90 days.
   */
  leaderboard: publicProcedure.query(async () => {
    const q = (interval: string | null) => sql<
      { handle: string; team: string | null; pnl: bigint }[]
    >`SELECT u.handle, u.team, SUM(l.delta)::bigint AS pnl
      FROM ledger l JOIN users u ON u.id = l.user_id
      WHERE u.is_system = false
        AND l.reason IN ('TRADE', 'PAYOUT', 'NA_REFUND')
        ${interval ? sql`AND l.ts > now() - ${interval}::interval` : sql``}
      GROUP BY u.id, u.handle, u.team
      ORDER BY pnl DESC
      LIMIT 50`;
    const [allTime, last90] = await Promise.all([
      db.execute<{ handle: string; team: string | null; pnl: bigint }>(q(null)),
      db.execute<{ handle: string; team: string | null; pnl: bigint }>(q("90 days")),
    ]);
    return { allTime: allTime.rows, last90: last90.rows };
  }),
});
