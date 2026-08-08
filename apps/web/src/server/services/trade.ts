import { randomUUID } from "node:crypto";
import {
  type LmsrState,
  applyTrade,
  pricesMicro,
  sharesForBudget,
} from "@poporslop/lmsr";
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { DomainError } from "./errors";
import { SYSTEM } from "./ledger";
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

interface ReadRow extends Record<string, unknown> {
  status: string;
  close_at: Date;
  outcomes: string[];
  b: bigint;
  position_cap: bigint | null;
  q: string[];
  version: number;
  points_balance: bigint;
  is_system: boolean;
  flags: Record<string, unknown>;
  user_created_at: Date;
}

/**
 * Spec §8: accounts younger than 7 days get a tighter per-market exposure
 * cap. Env-tunable because event mode (spec §12.2) wants the market's own
 * 300-pt cap to govern instead: set NEW_ACCOUNT_CAP_PTS=300 (or higher).
 */
const NEW_ACCOUNT_AGE_MS = 7 * 24 * 3600 * 1000;
const newAccountCapMicro = () => BigInt(process.env.NEW_ACCOUNT_CAP_PTS ?? 250) * 1_000_000n;

/**
 * THE trade transaction — the only writer of lmsr_state. Serialized per
 * market by the advisory lock; the optimistic version bump is a tripwire
 * that turns any future locking bug into a loud abort instead of silent
 * state corruption.
 *
 * Hot path: the room-scale load test concentrates ~24 trades/s on one
 * market, and every trade on it runs inside this one lock — so the work
 * here is packed into 2 reads + 2 writes. The write CTE embeds the ledger
 * contract postEntries() enforces elsewhere: one balanced TRADE group plus
 * matching balance-cache updates, in the same statement.
 */
export async function executeTrade(req: TradeRequest): Promise<TradeResult> {
  const { userId, marketId, outcomeIdx } = req;
  return db.transaction(async (tx) => {
    await lockMarket(tx, marketId);

    const read = await tx.execute<ReadRow>(sql`
      SELECT m.status, m.close_at, m.outcomes, m.b, m.position_cap,
             s.q, s.version,
             u.points_balance, u.is_system, u.flags, u.created_at AS user_created_at
      FROM markets m
      JOIN lmsr_state s ON s.market_id = m.id
      CROSS JOIN users u
      WHERE m.id = ${marketId} AND u.id = ${userId}
    `);
    const row = read.rows[0];
    if (!row) throw new DomainError("MARKET_NOT_FOUND");
    if (row.is_system || (row.flags as Record<string, unknown>).banned) {
      throw new DomainError("NOT_AUTHORIZED");
    }
    if (row.status !== "OPEN" || new Date(row.close_at).getTime() <= Date.now()) {
      throw new DomainError("MARKET_CLOSED");
    }
    if (!Number.isInteger(outcomeIdx) || outcomeIdx < 0 || outcomeIdx >= row.outcomes.length) {
      throw new DomainError("BAD_STATE", `outcome ${outcomeIdx} out of range`);
    }

    const q = row.q.map(BigInt);
    const engine: LmsrState = { q, b: row.b };

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

    const posRead = await tx.execute<{ outcome_idx: number; shares: bigint; cost_basis: bigint }>(sql`
      SELECT outcome_idx, shares, cost_basis FROM positions
      WHERE user_id = ${userId} AND market_id = ${marketId}
    `);
    const held = posRead.rows.find((p) => p.outcome_idx === outcomeIdx)?.shares ?? 0n;
    const totalBasis = posRead.rows.reduce((a, p) => a + p.cost_basis, 0n);

    // No shorting in v1: sell at most what you hold.
    if (delta < 0n && held < -delta) {
      throw new DomainError("CANNOT_SHORT", "cannot sell more shares than held");
    }

    const { q: newQ, cost } = applyTrade(engine, outcomeIdx, delta);

    if (req.maxCost !== undefined) {
      if (delta > 0n && cost > req.maxCost) throw new DomainError("PRICE_MOVED");
      if (delta < 0n && -cost < -req.maxCost) throw new DomainError("PRICE_MOVED");
    }
    if (cost > 0n && row.points_balance < cost) {
      throw new DomainError("INSUFFICIENT_BALANCE");
    }
    // Position cap: total cost basis across ALL outcomes of this market.
    if (row.position_cap !== null && cost > 0n && totalBasis + cost > row.position_cap) {
      throw new DomainError("POSITION_CAP");
    }
    // 7-day new-account exposure cap (spec §8) — the tighter bound wins.
    const accountAge = Date.now() - new Date(row.user_created_at).getTime();
    if (accountAge < NEW_ACCOUNT_AGE_MS && cost > 0n && totalBasis + cost > newAccountCapMicro()) {
      throw new DomainError("POSITION_CAP", "new accounts are capped at 250 pts per market for 7 days");
    }

    const updated = await tx.execute(sql`
      UPDATE lmsr_state SET q = ${`{${newQ.join(",")}}`}::bigint[], version = version + 1
      WHERE market_id = ${marketId} AND version = ${row.version}
    `);
    if (updated.rowCount !== 1) {
      // Advisory lock should make this impossible — loud abort, not corruption.
      throw new DomainError("CONCURRENT_UPDATE", "lmsr_state version tripwire fired");
    }

    const pBefore = pricesMicro(engine);
    const pAfter = pricesMicro({ q: newQ, b: row.b });
    const group = randomUUID();

    const write = await tx.execute<{ trade_id: bigint }>(sql`
      WITH trade_ins AS (
        INSERT INTO trades (user_id, market_id, outcome_idx, delta_shares, cost,
                            p_before, p_after, self_flagged)
        VALUES (${userId}, ${marketId}, ${outcomeIdx}, ${delta}, ${cost},
                ${`{${pBefore.join(",")}}`}::integer[], ${`{${pAfter.join(",")}}`}::integer[],
                ${req.selfFlagged ?? false})
        RETURNING id
      ),
      pos AS (
        INSERT INTO positions (user_id, market_id, outcome_idx, shares, cost_basis)
        VALUES (${userId}, ${marketId}, ${outcomeIdx}, ${delta}, ${cost})
        ON CONFLICT (user_id, market_id, outcome_idx)
        DO UPDATE SET shares = positions.shares + EXCLUDED.shares,
                      cost_basis = positions.cost_basis + EXCLUDED.cost_basis
      ),
      led AS (
        INSERT INTO ledger (entry_group, user_id, delta, reason, ref_id)
        SELECT ${group}, v.uid::uuid, v.d::bigint, 'TRADE', (SELECT id::text FROM trade_ins)
        FROM (VALUES (${userId}, ${-cost}), (${SYSTEM.ammPool}, ${cost})) AS v(uid, d)
        WHERE ${cost} <> 0
      ),
      bal AS (
        UPDATE users SET points_balance = points_balance + v.d::bigint
        FROM (VALUES (${userId}, ${-cost}), (${SYSTEM.ammPool}, ${cost})) AS v(uid, d)
        WHERE users.id = v.uid::uuid AND ${cost} <> 0
      )
      SELECT (SELECT id FROM trade_ins) AS trade_id
    `);

    return { tradeId: write.rows[0]!.trade_id, deltaShares: delta, cost, pAfter };
  });
}
