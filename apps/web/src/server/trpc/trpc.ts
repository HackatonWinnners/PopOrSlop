import { TRPCError, initTRPC } from "@trpc/server";
import superjson from "superjson";
import { getSessionUser } from "../services/auth";
import { DomainError, type DomainErrorCode } from "../services/errors";

export interface TrpcContext {
  user: Awaited<ReturnType<typeof getSessionUser>>;
}

export async function createContext(opts: { sessionToken?: string }): Promise<TrpcContext> {
  return { user: await getSessionUser(opts.sessionToken) };
}

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

const DOMAIN_TO_TRPC: Record<DomainErrorCode, TRPCError["code"]> = {
  INSUFFICIENT_BALANCE: "BAD_REQUEST",
  POSITION_CAP: "BAD_REQUEST",
  MARKET_CLOSED: "BAD_REQUEST",
  MARKET_NOT_FOUND: "NOT_FOUND",
  PRICE_MOVED: "CONFLICT",
  CANNOT_SHORT: "BAD_REQUEST",
  BAD_STATE: "BAD_REQUEST",
  NOT_AUTHORIZED: "FORBIDDEN",
  CONCURRENT_UPDATE: "CONFLICT",
};

/** Convert service-layer DomainErrors into typed tRPC errors. */
const domainErrorMiddleware = t.middleware(async ({ next }) => {
  const result = await next();
  if (!result.ok && result.error.cause instanceof DomainError) {
    const cause = result.error.cause;
    throw new TRPCError({
      code: DOMAIN_TO_TRPC[cause.code],
      message: cause.code === cause.message ? cause.code : `${cause.code}: ${cause.message}`,
      cause,
    });
  }
  return result;
});

export const router = t.router;
export const publicProcedure = t.procedure.use(domainErrorMiddleware);

export const authedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { user: ctx.user } });
});

export const adminProcedure = authedProcedure.use(({ ctx, next }) => {
  const flags = ctx.user.flags as Record<string, unknown>;
  if (!flags.admin) throw new TRPCError({ code: "FORBIDDEN" });
  return next();
});
