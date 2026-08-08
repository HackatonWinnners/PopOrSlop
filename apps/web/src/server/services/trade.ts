import {
  type LmsrState,
  applyTrade,
  pricesMicro,
  sharesForBudget,
} from "@poporslop/lmsr";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { lmsrState, markets, positions, trades, users } from "../db/schema";
import { DomainError } from "./errors";
import { SYSTEM, postEntries } from "./ledger";
import { lockMarket } from "./locks";

export interface TradeRequest {
  userId: string;
  marketId: string;
  outcomeIdx: number;
  /** Signed µshares. Mutually exclusive with budget. */
  deltaShares?: bigint;
  /** Buy as many µshares as this many µpts affords. */
  budget?: bigint;
  /**
   * Slippage bound, µpts: for buys, abort if cost exceeds it; for sells,
   * abort if proceeds fall below |maxCost|. Server recomputes everything —
   * client-quoted prices are never trusted.
   */
  maxCost?: bigint;
  selfFlagged?: boolean;
}

export interface TradeResult {
  tradeId: bigint;
  deltaShares: bigint;
  cost: bigint;
  pAfter: number[];
}

/**
 * THE trade transaction — the only writer of lmsr_state. Serialized per
 * market by the advisory lock; the optimistic version bump is a tripwire
 * that turns any future locking bug into a loud abort instead of silent
 * state corruption.
 */
export async function executeTrade(req: TradeRequest): Promise<TradeResult> {
  const { userId, marketId, outcomeIdx } = req;
  return db.transaction(async (tx) => {
    await lockMarket(tx, marketId);

    const [market] = await tx.select().from(markets).where(eq(markets.id, marketId));
    if (!market) throw new DomainError("MARKET_NOT_FOUND");
    if (market.status !== "OPEN" || market.closeAt.getTime() <= Date.now()) {
      throw new DomainError("MARKET_CLOSED");
    }
    if (!Number.isInteger(outcomeIdx) || outcomeIdx < 0 || outcomeIdx >= market.outcomes.length) {
      throw new DomainError("BAD_STATE", `outcome ${outcomeIdx} out of range`);
    }

    const [state] = await tx.select().from(lmsrState).where(eq(lmsrState.marketId, marketId));
    if (!state) throw new DomainError("BAD_STATE", "missing lmsr_state");
    const engine: LmsrState = { q: state.q, b: market.b };

    let delta: bigint;
    if (req.deltaShares !== undefined && req.budget === undefined) {
      delta = req.deltaShares;
    } else if (req.budget !== undefined && req.deltaShares === undefined) {
      if (req.budget <= 0n) throw new DomainError("BAD_STATE", "budget must be positive");
      delta = sharesForBudget(engine, outcomeIdx, req.budget);
    } else {
      throw new DomainError("BAD_STATE", "provide exactly one of deltaShares | budget");
    }
    if (delta === 0n) throw new DomainError("BAD_STATE", "trade size is zero");

    const [position] = await tx
      .select()
      .from(positions)
      .where(
        and(
          eq(positions.userId, userId),
          eq(positions.marketId, marketId),
          eq(positions.outcomeIdx, outcomeIdx),
        ),
      );

    // No shorting in v1: sell at most what you hold.
    if (delta < 0n && (position?.shares ?? 0n) < -delta) {
      throw new DomainError("CANNOT_SHORT", "cannot sell more shares than held");
    }

    const { q: newQ, cost } = applyTrade(engine, outcomeIdx, delta);

    if (req.maxCost !== undefined) {
      if (delta > 0n && cost > req.maxCost) throw new DomainError("PRICE_MOVED");
      if (delta < 0n && -cost < -req.maxCost) throw new DomainError("PRICE_MOVED");
    }

    const [trader] = await tx.select().from(users).where(eq(users.id, userId));
    if (!trader || trader.isSystem) throw new DomainError("NOT_AUTHORIZED");
    if ((trader.flags as Record<string, unknown>).banned) throw new DomainError("NOT_AUTHORIZED");
    if (cost > 0n && trader.pointsBalance < cost) {
      throw new DomainError("INSUFFICIENT_BALANCE");
    }

    // Position cap: total cost basis across ALL outcomes of this market.
    if (market.positionCap !== null && cost > 0n) {
      const [row] = await tx
        .select({ basis: sql<bigint>`COALESCE(SUM(${positions.costBasis}), 0)::bigint` })
        .from(positions)
        .where(and(eq(positions.userId, userId), eq(positions.marketId, marketId)));
      if ((row?.basis ?? 0n) + cost > market.positionCap) {
        throw new DomainError("POSITION_CAP");
      }
    }

    const updated = await tx
      .update(lmsrState)
      .set({ q: newQ, version: state.version + 1 })
      .where(and(eq(lmsrState.marketId, marketId), eq(lmsrState.version, state.version)))
      .returning({ version: lmsrState.version });
    if (updated.length !== 1) {
      // Advisory lock should make this impossible — loud abort, not corruption.
      throw new DomainError("CONCURRENT_UPDATE", "lmsr_state version tripwire fired");
    }

    const pBefore = pricesMicro(engine);
    const pAfter = pricesMicro({ q: newQ, b: market.b });

    const [tradeRow] = await tx
      .insert(trades)
      .values({
        userId,
        marketId,
        outcomeIdx,
        deltaShares: delta,
        cost,
        pBefore,
        pAfter,
        selfFlagged: req.selfFlagged ?? false,
      })
      .returning({ id: trades.id });

    await tx
      .insert(positions)
      .values({ userId, marketId, outcomeIdx, shares: delta, costBasis: cost })
      .onConflictDoUpdate({
        target: [positions.userId, positions.marketId, positions.outcomeIdx],
        set: {
          shares: sql`${positions.shares} + ${delta}`,
          costBasis: sql`${positions.costBasis} + ${cost}`,
        },
      });

    if (cost !== 0n) {
      await postEntries(tx, [
        { userId, delta: -cost, reason: "TRADE", refId: String(tradeRow!.id) },
        { userId: SYSTEM.ammPool, delta: cost, reason: "TRADE", refId: String(tradeRow!.id) },
      ]);
    }

    return { tradeId: tradeRow!.id, deltaShares: delta, cost, pAfter };
  });
}
