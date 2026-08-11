import { pricesMicro } from "@poporslop/lmsr";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { SUMMERUP_MARKET_SLUG } from "~/lib/summerup-teams";
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
   * Leaderboards (spec §6.3) — four views over one trading record.
   *
   * All of them read only TRADE / PAYOUT / NA_REFUND, so signup grants, drip,
   * referrals and quest rewards can never buy rank.
   *
   * `net` is the headline. `realized` alone is honest but misleading before
   * anything resolves: a buy is pure outflow and nothing pays until resolution,
   * so every trader shows a loss and the top of the board is whoever traded
   * least. Adding the current value of open positions fixes that.
   *
   * `net` is cash + mark. After resolution the position rows are deleted, mark
   * goes to zero and it collapses back to plain realized cash — nothing to
   * special-case.
   *
   * Splitting that into banked-vs-open needs average-cost accounting, which the
   * schema doesn't carry: `positions.cost_basis` is *net cash into the position*
   * and turns negative once you've sold at a profit, so `cash + basis` is
   * identically zero. Hence the trade replay below. It's O(trades) per call on a
   * table with a hundred rows today; materialize realized P&L onto the position
   * if that stops being true.
   *
   * Marks are mid-price and ignore slippage: a big position is worth somewhat
   * less than it shows, because selling it walks the price down.
   */
  leaderboard: publicProcedure.query(async () => {
    const active = and(
      eq(users.isSystem, false),
      sql`COALESCE((${users.flags}->>'banned')::boolean, false) = false`,
    );

    const cashSince = (interval: string | null) => sql`
      SELECT l.user_id, SUM(l.delta)::bigint AS cash
      FROM ledger l
      WHERE l.reason IN ('TRADE', 'PAYOUT', 'NA_REFUND')
        ${interval ? sql`AND l.ts > now() - ${interval}::interval` : sql``}
      GROUP BY l.user_id`;

    const [people, cashAll, cash90, held, eventRows] = await Promise.all([
      db.select({ id: users.id, handle: users.handle, team: users.team }).from(users).where(active),
      db.execute<{ user_id: string; cash: bigint }>(cashSince(null)),
      db.execute<{ user_id: string; cash: bigint }>(cashSince("90 days")),
      db
        .select({
          userId: positions.userId,
          marketId: positions.marketId,
          outcomeIdx: positions.outcomeIdx,
          shares: positions.shares,
          b: markets.b,
          q: lmsrState.q,
        })
        .from(positions)
        .innerJoin(markets, eq(markets.id, positions.marketId))
        .leftJoin(lmsrState, eq(lmsrState.marketId, positions.marketId)),
      db.select({ id: markets.id }).from(markets).where(eq(markets.slug, SUMMERUP_MARKET_SLUG)),
    ]);

    const eventId = eventRows[0]?.id ?? null;

    // One price vector per market, shared by everyone holding it.
    const priceCache = new Map<string, number[] | null>();
    const pricesFor = (marketId: string, q: bigint[] | null, b: bigint) => {
      if (!priceCache.has(marketId)) priceCache.set(marketId, q ? pricesMicro({ q, b }) : null);
      return priceCache.get(marketId)!;
    };

    const addTo = (m: Map<string, bigint>, id: string, v: bigint) =>
      m.set(id, (m.get(id) ?? 0n) + v);

    const mark = new Map<string, bigint>();
    const eventMark = new Map<string, bigint>();
    for (const p of held) {
      const price = pricesFor(p.marketId, p.q, p.b)?.[p.outcomeIdx];
      if (price === undefined) continue;
      const value = (p.shares * BigInt(price)) / 1_000_000n;
      addTo(mark, p.userId, value);
      if (p.marketId === eventId) addTo(eventMark, p.userId, value);
    }

    // Average-cost replay: walk every trade in order, and on each sell book the
    // difference between the proceeds and the average cost of the shares sold.
    const realized = new Map<string, bigint>();
    const eventRealized = new Map<string, bigint>();
    const lot = new Map<string, { shares: bigint; basis: bigint }>();
    const tape = await db.execute<{
      user_id: string;
      market_id: string;
      outcome_idx: number;
      delta_shares: bigint;
      cost: bigint;
    }>(sql`
      SELECT user_id, market_id, outcome_idx, delta_shares, cost
      FROM trades ORDER BY ts, id`);

    for (const t of tape.rows) {
      const key = `${t.user_id}|${t.market_id}|${t.outcome_idx}`;
      const cur = lot.get(key) ?? { shares: 0n, basis: 0n };
      const delta = BigInt(t.delta_shares);
      const cost = BigInt(t.cost);
      if (delta > 0n) {
        cur.shares += delta;
        cur.basis += cost;
      } else {
        const sold = -delta;
        // Proportional share of what the holding cost. Guard the divide: a
        // forced void (admin voidAndBan) can sell shares the lot doesn't know.
        const spent = cur.shares > 0n ? (cur.basis * sold) / cur.shares : 0n;
        const gain = -cost - spent;
        cur.basis -= spent;
        cur.shares -= sold > cur.shares ? cur.shares : sold;
        addTo(realized, t.user_id, gain);
        if (t.market_id === eventId) addTo(eventRealized, t.user_id, gain);
      }
      lot.set(key, cur);
    }

    // Cash on a single market can't come from the ledger — TRADE rows aren't
    // market-scoped. The trades table is, and PAYOUT / NA_REFUND carry the
    // market id in ref_id.
    const eventCash = new Map<string, bigint>();
    if (eventId) {
      const [spent, paid] = await Promise.all([
        db.execute<{ user_id: string; cost: bigint }>(
          sql`SELECT t.user_id, SUM(t.cost)::bigint AS cost
              FROM trades t WHERE t.market_id = ${eventId} GROUP BY t.user_id`,
        ),
        db.execute<{ user_id: string; delta: bigint }>(
          sql`SELECT l.user_id, SUM(l.delta)::bigint AS delta
              FROM ledger l
              WHERE l.ref_id = ${eventId} AND l.reason IN ('PAYOUT', 'NA_REFUND')
              GROUP BY l.user_id`,
        ),
      ]);
      for (const r of spent.rows) eventCash.set(r.user_id, -BigInt(r.cost));
      for (const r of paid.rows) {
        eventCash.set(r.user_id, (eventCash.get(r.user_id) ?? 0n) + BigInt(r.delta));
      }
    }

    const cashOf = (rows: { user_id: string; cash: bigint }[]) =>
      new Map(rows.map((r) => [r.user_id, BigInt(r.cash)]));
    const allCash = cashOf(cashAll.rows);
    const recentCash = cashOf(cash90.rows);

    const board = (of: (userId: string) => { pnl: bigint; banked: bigint; open: bigint }) =>
      people
        .map((u) => ({ handle: u.handle, team: u.team, ...of(u.id) }))
        .filter((r) => r.pnl !== 0n || r.open !== 0n)
        .sort((a, b) => (a.pnl === b.pnl ? 0 : a.pnl < b.pnl ? 1 : -1))
        .slice(0, 50);

    /** net = cash + mark, split so that banked + open === pnl exactly. */
    const netOf = (cash: bigint, marked: bigint, booked: bigint) => {
      const pnl = cash + marked;
      return { pnl, banked: booked, open: pnl - booked };
    };

    return {
      net: board((id) =>
        netOf(allCash.get(id) ?? 0n, mark.get(id) ?? 0n, realized.get(id) ?? 0n),
      ),
      realized: board((id) => {
        const cash = allCash.get(id) ?? 0n;
        return { pnl: cash, banked: cash, open: 0n };
      }),
      realized90: board((id) => {
        const cash = recentCash.get(id) ?? 0n;
        return { pnl: cash, banked: cash, open: 0n };
      }),
      summerup: eventId
        ? board((id) =>
            netOf(eventCash.get(id) ?? 0n, eventMark.get(id) ?? 0n, eventRealized.get(id) ?? 0n),
          )
        : [],
    };
  }),
});
