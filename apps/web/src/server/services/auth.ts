import { createHash, randomBytes } from "node:crypto";
import { pts } from "@poporslop/lmsr";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { magicLinkTokens, sessions, users } from "../db/schema";
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

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;

/**
 * W1 magic-link flow. Request: store a hashed one-time token; delivery via
 * Resend when RESEND_API_KEY is set, console fallback in dev. The route
 * always answers 200 so account existence never leaks.
 */
export async function requestMagicLink(email: string, baseUrl: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  await db.insert(magicLinkTokens).values({
    email: email.toLowerCase(),
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
  });
  const url = `${baseUrl}/api/auth/magic-link/verify?token=${token}`;
  const key = process.env.RESEND_API_KEY;
  if (key) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env.MAGIC_LINK_FROM ?? "PopOrSlop <login@poporslop.dev>",
        to: email,
        subject: "Your PopOrSlop sign-in link",
        text: `Sign in to PopOrSlop (link valid 15 minutes):\n\n${url}\n\nIf you didn't request this, ignore it.`,
      }),
    });
    if (!res.ok) console.error(`[auth] resend failed: ${res.status} ${await res.text()}`);
  } else {
    console.log(`[auth] magic link for ${email} (no RESEND_API_KEY, dev mode):\n  ${url}`);
  }
}

/**
 * Verify a magic-link token and resolve it to a session:
 * - token's email already owns an account → sign that account in;
 * - visitor is signed in to a W0 handle-only account with no email → attach
 *   the email to it (the account-merge path for event signups);
 * - otherwise → create a fresh funded account with a handle derived from the
 *   email local part.
 */
export async function verifyMagicLink(
  token: string,
  currentUser: Awaited<ReturnType<typeof getSessionUser>>,
): Promise<{ token: string; expiresAt: Date }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(magicLinkTokens)
      .where(eq(magicLinkTokens.tokenHash, hashToken(token)));
    if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
      throw new DomainError("NOT_AUTHORIZED", "invalid or expired link");
    }
    await tx.update(magicLinkTokens).set({ usedAt: new Date() }).where(eq(magicLinkTokens.id, row.id));

    const [owner] = await tx.select().from(users).where(eq(users.email, row.email));

    let userId: string;
    if (owner) {
      userId = owner.id;
    } else if (currentUser && !currentUser.email && !currentUser.isSystem) {
      await tx.update(users).set({ email: row.email }).where(eq(users.id, currentUser.id));
      userId = currentUser.id;
    } else {
      const base =
        row.email
          .split("@")[0]!
          .replace(/[^a-zA-Z0-9_-]/g, "")
          .slice(0, 20) || "trader";
      let handle = base.length >= 2 ? base : `${base}42`;
      for (let i = 0; ; i++) {
        const [taken] = await tx.select({ id: users.id }).from(users).where(eq(users.handle, handle));
        if (!taken) break;
        handle = `${base.slice(0, 16)}${randomBytes(2).toString("hex")}`;
        if (i > 5) throw new DomainError("BAD_STATE", "could not allocate handle");
      }
      const [created] = await tx
        .insert(users)
        .values({ handle, email: row.email })
        .returning({ id: users.id });
      await postEntries(tx, [
        { userId: SYSTEM.houseTreasury, delta: -SIGNUP_GRANT, reason: "SIGNUP_GRANT", refId: created!.id },
        { userId: created!.id, delta: SIGNUP_GRANT, reason: "SIGNUP_GRANT", refId: created!.id },
      ]);
      userId = created!.id;
    }

    const sessionToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await tx.insert(sessions).values({ userId, tokenHash: hashToken(sessionToken), expiresAt });
    return { token: sessionToken, expiresAt };
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
