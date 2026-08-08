import { pricesMicro } from "@poporslop/lmsr";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { ledger, lmsrState, markets, positions, users } from "../../db/schema";
import { authedProcedure, publicProcedure, router } from "../trpc";

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
      .where(and(eq(positions.userId, ctx.user.id), gt(positions.shares, 0n)));

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
