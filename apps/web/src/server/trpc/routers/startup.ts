import { pricesMicro, tokenPrice, tokenTradeCost, tokensForBudget } from "@poporslop/lmsr";
import { desc, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client";
import {
  companies,
  lmsrState,
  markets,
  tokenPositions,
  tokenState,
  tokenTrades,
  users,
} from "../../db/schema";
import { executeTokenTrade, listStartup } from "../../services/tokens";
import { adminProcedure, authedProcedure, publicProcedure, router } from "../trpc";

const bigintFromString = z
  .union([z.bigint(), z.string().regex(/^-?\d+$/)])
  .transform((v) => (typeof v === "bigint" ? v : BigInt(v)));

export const startupRouter = router({
  /** All startups with a profile surface — listed ones first, with token price. */
  list: publicProcedure.query(async () => {
    const rows = await db
      .select({ company: companies, token: tokenState })
      .from(companies)
      .leftJoin(tokenState, eq(tokenState.companyId, companies.id))
      .orderBy(sql`${companies.listedAt} DESC NULLS LAST`, companies.name);
    return rows.map((r) => ({
      id: r.company.id,
      slug: r.company.slug,
      name: r.company.name,
      logoUrl: r.company.logoUrl,
      listed: r.company.listedAt !== null,
      priceMicro: r.token
        ? tokenPrice({ supply: r.token.supply, p0: r.token.p0, slope: r.token.slope })
        : null,
      supply: r.token?.supply ?? null,
    }));
  }),

  bySlug: publicProcedure.input(z.object({ slug: z.string() })).query(async ({ input }) => {
    const [row] = await db
      .select({ company: companies, token: tokenState })
      .from(companies)
      .leftJoin(tokenState, eq(tokenState.companyId, companies.id))
      .where(eq(companies.slug, input.slug));
    if (!row) return null;

    const companyMarkets = await db
      .select({ market: markets, q: lmsrState.q })
      .from(markets)
      .leftJoin(lmsrState, eq(lmsrState.marketId, markets.id))
      .where(eq(markets.companyId, row.company.id))
      .orderBy(desc(markets.createdAt));

    return {
      id: row.company.id,
      slug: row.company.slug,
      name: row.company.name,
      logoUrl: row.company.logoUrl,
      description: row.company.description,
      links: row.company.links as Record<string, string>,
      listed: row.company.listedAt !== null,
      listedAt: row.company.listedAt,
      token: row.token
        ? {
            supply: row.token.supply,
            p0: row.token.p0,
            slope: row.token.slope,
            priceMicro: tokenPrice({
              supply: row.token.supply,
              p0: row.token.p0,
              slope: row.token.slope,
            }),
          }
        : null,
      markets: companyMarkets.map((m) => ({
        id: m.market.id,
        slug: m.market.slug,
        title: m.market.title,
        status: m.market.status,
        outcomes: m.market.outcomes,
        resolvedOutcome: m.market.resolvedOutcome,
        pricesMicro: m.q ? pricesMicro({ q: m.q, b: m.market.b }) : null,
      })),
    };
  }),

  tokenQuote: publicProcedure
    .input(
      z.object({
        companyId: z.string().uuid(),
        budget: bigintFromString.optional(),
        deltaTokens: bigintFromString.optional(),
      }),
    )
    .query(async ({ input }) => {
      const [t] = await db.select().from(tokenState).where(eq(tokenState.companyId, input.companyId));
      if (!t) return null;
      const state = { supply: t.supply, p0: t.p0, slope: t.slope };
      if (input.budget !== undefined) {
        const delta = tokensForBudget(state, input.budget);
        return { deltaTokens: delta, cost: tokenTradeCost(state, delta) };
      }
      if (input.deltaTokens !== undefined) {
        return { deltaTokens: input.deltaTokens, cost: tokenTradeCost(state, input.deltaTokens) };
      }
      return null;
    }),

  tokenTrade: authedProcedure
    .input(
      z.object({
        companyId: z.string().uuid(),
        deltaTokens: bigintFromString.optional(),
        budget: bigintFromString.optional(),
        maxCost: bigintFromString.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return executeTokenTrade({ userId: ctx.user.id, ...input });
    }),

  /** Price history for the token chart. */
  tokenHistory: publicProcedure
    .input(z.object({ companyId: z.string().uuid(), limit: z.number().int().min(10).max(500).default(200) }))
    .query(async ({ input }) => {
      const rows = await db
        .select({ ts: tokenTrades.ts, priceAfter: tokenTrades.priceAfter })
        .from(tokenTrades)
        .where(eq(tokenTrades.companyId, input.companyId))
        .orderBy(desc(tokenTrades.ts), desc(tokenTrades.id))
        .limit(input.limit);
      return rows.reverse();
    }),

  /** My token position on one startup. */
  myTokens: authedProcedure
    .input(z.object({ companyId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [pos] = await db
        .select()
        .from(tokenPositions)
        .where(
          sql`${tokenPositions.userId} = ${ctx.user.id} AND ${tokenPositions.companyId} = ${input.companyId}`,
        );
      return pos ?? null;
    }),

  /** Admin: record the off-ledger listing payment and launch the token. */
  listStartup: adminProcedure
    .input(
      z.object({
        companyId: z.string().uuid(),
        paymentUsd: z.number().min(0).max(10_000_000),
        allocationTokens: z.number().int().min(0).max(1_000_000).optional(),
        logoUrl: z.string().url().optional(),
        description: z.string().max(2000).optional(),
        links: z.record(z.string(), z.string().url()).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return listStartup({
        companyId: input.companyId,
        paymentUsd: input.paymentUsd,
        allocationTokens:
          input.allocationTokens !== undefined ? BigInt(input.allocationTokens) * 1_000_000n : undefined,
        logoUrl: input.logoUrl,
        description: input.description,
        links: input.links,
      });
    }),

  /** Admin: edit profile fields any time. */
  updateProfile: adminProcedure
    .input(
      z.object({
        companyId: z.string().uuid(),
        logoUrl: z.string().url().nullable().optional(),
        description: z.string().max(2000).nullable().optional(),
        links: z.record(z.string(), z.string().url()).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      await db
        .update(companies)
        .set({
          ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.links !== undefined ? { links: input.links } : {}),
        })
        .where(eq(companies.id, input.companyId));
    }),

  /** Companies not yet listed — the admin picker. */
  unlisted: adminProcedure.query(async () => {
    return db
      .select({ id: companies.id, name: companies.name, slug: companies.slug })
      .from(companies)
      .where(sql`${companies.listedAt} IS NULL`)
      .orderBy(companies.name);
  }),
});
