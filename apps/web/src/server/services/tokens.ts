import { randomUUID } from "node:crypto";
import {
  type CurveState,
  listingDefaults,
  tokenPrice,
  tokenTradeCost,
  tokensForBudget,
} from "@poporslop/lmsr";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { companies, tokenState, users } from "../db/schema";
import { DomainError } from "./errors";
import { SYSTEM, postEntries } from "./ledger";

/** Default allocation minted to the startup's own account at listing. */
export const DEFAULT_ALLOCATION_TOKENS = 500n * 1_000_000n; // 500 tokens, µtokens

const TOKEN_LOCK_CLASS = 0x70b0;

function companyLockKey(companyId: string): number {
  return Number.parseInt(companyId.replace(/-/g, "").slice(0, 8), 16) | 0;
}

/**
 * List a startup (admin action). The real-money payment happens OFF-ledger
 * (invoice); its amount only parameterizes the curve: bigger payment → higher
 * launch price. The startup's token allocation is made sellable by a treasury
 * subsidy into the token pool equal to the allocation's curve value — funded,
 * economically, by the listing fee. All on-platform value stays play points.
 */
export async function listStartup(opts: {
  companyId: string;
  paymentUsd: number;
  p0?: bigint;
  slope?: bigint;
  allocationTokens?: bigint;
  logoUrl?: string;
  description?: string;
  links?: Record<string, string>;
}) {
  const alloc = opts.allocationTokens ?? DEFAULT_ALLOCATION_TOKENS;
  const defaults = listingDefaults(opts.paymentUsd);
  const p0 = opts.p0 ?? defaults.p0;
  const slope = opts.slope ?? defaults.slope;

  return db.transaction(async (tx) => {
    const [company] = await tx.select().from(companies).where(eq(companies.id, opts.companyId));
    if (!company) throw new DomainError("BAD_STATE", "company not found");
    if (company.listedAt) throw new DomainError("BAD_STATE", "company already listed");

    // Startup's holding account (no login in v1; sells route through admin).
    const [account] = await tx
      .insert(users)
      .values({
        handle: `s-${company.slug ?? company.id.slice(0, 8)}`.slice(0, 24),
        flags: { company: company.id },
      })
      .returning({ id: users.id });

    await tx.insert(tokenState).values({ companyId: company.id, supply: alloc, p0, slope });

    // Fund the pool so the allocation is fully sellable without draining
    // other traders' points: treasury pays the allocation's curve value.
    const allocCost = tokenTradeCost({ supply: 0n, p0, slope }, alloc);
    if (allocCost > 0n) {
      await postEntries(tx, [
        { userId: SYSTEM.houseTreasury, delta: -allocCost, reason: "TOKEN_LISTING_SUBSIDY", refId: company.id },
        { userId: SYSTEM.tokenPool, delta: allocCost, reason: "TOKEN_LISTING_SUBSIDY", refId: company.id },
      ]);
    }

    await tx.execute(sql`
      INSERT INTO token_positions (user_id, company_id, tokens, cost_basis)
      VALUES (${account!.id}, ${company.id}, ${alloc}, 0)
    `);
    await tx.execute(sql`
      INSERT INTO token_trades (user_id, company_id, delta_tokens, cost, price_after)
      VALUES (${account!.id}, ${company.id}, ${alloc}, 0,
              ${tokenPrice({ supply: alloc, p0, slope })})
    `);

    await tx
      .update(companies)
      .set({
        listedAt: new Date(),
        listingPaymentUsd: BigInt(Math.round(opts.paymentUsd)),
        accountUserId: account!.id,
        logoUrl: opts.logoUrl ?? company.logoUrl,
        description: opts.description ?? company.description,
        links: opts.links ?? company.links,
      })
      .where(eq(companies.id, company.id));

    return { companyId: company.id, p0, slope, allocation: alloc, allocSubsidy: allocCost };
  });
}

export interface TokenTradeRequest {
  userId: string;
  companyId: string;
  deltaTokens?: bigint;
  budget?: bigint;
  maxCost?: bigint;
}

/** Buy/sell startup tokens on the bonding curve. Points in, points out. */
export async function executeTokenTrade(req: TokenTradeRequest) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${TOKEN_LOCK_CLASS}, ${companyLockKey(req.companyId)})`,
    );

    const read = await tx.execute<{
      supply: bigint;
      p0: bigint;
      slope: bigint;
      version: number;
      points_balance: bigint;
      is_system: boolean;
      flags: Record<string, unknown>;
      tokens: bigint | null;
    }>(sql`
      SELECT t.supply, t.p0, t.slope, t.version,
             u.points_balance, u.is_system, u.flags,
             p.tokens
      FROM token_state t
      CROSS JOIN users u
      LEFT JOIN token_positions p ON p.user_id = u.id AND p.company_id = t.company_id
      WHERE t.company_id = ${req.companyId} AND u.id = ${req.userId}
    `);
    const row = read.rows[0];
    if (!row) throw new DomainError("MARKET_NOT_FOUND", "startup not listed");
    if (row.is_system || (row.flags as Record<string, unknown>).banned) {
      throw new DomainError("NOT_AUTHORIZED");
    }

    const state: CurveState = { supply: row.supply, p0: row.p0, slope: row.slope };
    let delta: bigint;
    if (req.deltaTokens !== undefined && req.budget === undefined) {
      delta = req.deltaTokens;
    } else if (req.budget !== undefined && req.deltaTokens === undefined) {
      if (req.budget <= 0n) throw new DomainError("BAD_STATE", "budget must be positive");
      delta = tokensForBudget(state, req.budget);
    } else {
      throw new DomainError("BAD_STATE", "provide exactly one of deltaTokens | budget");
    }
    if (delta === 0n) throw new DomainError("BAD_STATE", "trade size is zero");
    if (delta < 0n && (row.tokens ?? 0n) < -delta) {
      throw new DomainError("CANNOT_SHORT", "cannot sell more tokens than held");
    }

    const cost = tokenTradeCost(state, delta);
    if (req.maxCost !== undefined) {
      if (delta > 0n && cost > req.maxCost) throw new DomainError("PRICE_MOVED");
      if (delta < 0n && -cost < -req.maxCost) throw new DomainError("PRICE_MOVED");
    }
    if (cost > 0n && row.points_balance < cost) throw new DomainError("INSUFFICIENT_BALANCE");

    const updated = await tx.execute(sql`
      UPDATE token_state SET supply = supply + ${delta}, version = version + 1
      WHERE company_id = ${req.companyId} AND version = ${row.version}
    `);
    if (updated.rowCount !== 1) {
      throw new DomainError("CONCURRENT_UPDATE", "token_state version tripwire fired");
    }

    const priceAfter = tokenPrice({ supply: row.supply + delta, p0: row.p0, slope: row.slope });
    const group = randomUUID();
    const write = await tx.execute<{ trade_id: bigint }>(sql`
      WITH trade_ins AS (
        INSERT INTO token_trades (user_id, company_id, delta_tokens, cost, price_after)
        VALUES (${req.userId}, ${req.companyId}, ${delta}, ${cost}, ${priceAfter})
        RETURNING id
      ),
      pos AS (
        INSERT INTO token_positions (user_id, company_id, tokens, cost_basis)
        VALUES (${req.userId}, ${req.companyId}, ${delta}, ${cost})
        ON CONFLICT (user_id, company_id)
        DO UPDATE SET tokens = token_positions.tokens + EXCLUDED.tokens,
                      cost_basis = token_positions.cost_basis + EXCLUDED.cost_basis
      ),
      led AS (
        INSERT INTO ledger (entry_group, user_id, delta, reason, ref_id)
        SELECT ${group}, v.uid::uuid, v.d::bigint, 'TOKEN_TRADE', (SELECT id::text FROM trade_ins)
        FROM (VALUES (${req.userId}, ${-cost}), (${SYSTEM.tokenPool}, ${cost})) AS v(uid, d)
        WHERE ${cost} <> 0
      ),
      bal AS (
        UPDATE users SET points_balance = points_balance + v.d::bigint
        FROM (VALUES (${req.userId}, ${-cost}), (${SYSTEM.tokenPool}, ${cost})) AS v(uid, d)
        WHERE users.id = v.uid::uuid AND ${cost} <> 0
      )
      SELECT (SELECT id FROM trade_ins) AS trade_id
    `);

    return { tradeId: write.rows[0]!.trade_id, deltaTokens: delta, cost, priceAfter };
  });
}
