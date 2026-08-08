import { createHash, randomBytes } from "node:crypto";
import { pts } from "@poporslop/lmsr";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { sessions, users } from "../db/schema";
import { DomainError } from "./errors";
import { SYSTEM, postEntries } from "./ledger";

export const SIGNUP_GRANT = pts(1000);
export const DAILY_DRIP = pts(25);
export const REFERRAL_BONUS = pts(250);
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;

const HANDLE_RE = /^[a-zA-Z0-9_-]{2,24}$/;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * W0 auth-lite: handle (+ optional team & email) → funded account + session.
 * The signup grant is a balanced ledger group against the treasury, so the
 * global zero-sum invariant holds from the first user on.
 */
export async function signup(input: {
  handle: string;
  team?: string;
  email?: string;
}): Promise<{ userId: string; token: string; expiresAt: Date }> {
  if (!HANDLE_RE.test(input.handle)) {
    throw new DomainError("BAD_STATE", "handle must be 2-24 chars [a-zA-Z0-9_-]");
  }
  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        handle: input.handle,
        team: input.team,
        email: input.email || null,
      })
      .returning({ id: users.id })
      .catch((e: { code?: string }) => {
        if (e.code === "23505") throw new DomainError("BAD_STATE", "handle or email already taken");
        throw e;
      });

    await postEntries(tx, [
      { userId: SYSTEM.houseTreasury, delta: -SIGNUP_GRANT, reason: "SIGNUP_GRANT", refId: user!.id },
      { userId: user!.id, delta: SIGNUP_GRANT, reason: "SIGNUP_GRANT", refId: user!.id },
    ]);

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await tx.insert(sessions).values({ userId: user!.id, tokenHash: hashToken(token), expiresAt });
    return { userId: user!.id, token, expiresAt };
  });
}

export async function getSessionUser(token: string | undefined) {
  if (!token) return null;
  const [row] = await db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, hashToken(token)));
  if (!row || row.expiresAt.getTime() < Date.now()) return null;
  return row.user;
}
