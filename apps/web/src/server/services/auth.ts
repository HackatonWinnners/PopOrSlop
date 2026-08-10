import { createHash, randomBytes } from "node:crypto";
import { pts } from "@poporslop/lmsr";
import { asc, eq } from "drizzle-orm";
import { type Tx, db } from "../db/client";
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
 *
 * An email given here is *claimed, not proven*: it lands in `pending_email`
 * (non-unique) and only moves into the unique `users.email` slot once the
 * owner clicks the verification link. Otherwise anyone could type a stranger's
 * address at signup and permanently lock them out of registering it.
 */
export async function signup(input: {
  handle: string;
  team?: string;
  email?: string;
  /** Referrer's handle (from a /join?ref=… link). Unknown/self refs are ignored. */
  ref?: string;
  /** Best-effort client device fingerprint (spec §8). */
  deviceFp?: string;
  /** Origin for the verification link; omit to skip sending (tests, scripts). */
  baseUrl?: string;
}): Promise<{ userId: string; token: string; expiresAt: Date; verificationSent: boolean }> {
  if (!HANDLE_RE.test(input.handle)) {
    throw new DomainError("BAD_STATE", "handle must be 2-24 chars [a-zA-Z0-9_-]");
  }
  const pendingEmail = input.email?.trim().toLowerCase() || null;
  const result = await db.transaction(async (tx) => {
    let referredBy: string | null = null;
    if (input.ref && input.ref !== input.handle) {
      const [referrer] = await tx
        .select({ id: users.id, isSystem: users.isSystem })
        .from(users)
        .where(eq(users.handle, input.ref));
      if (referrer && !referrer.isSystem) referredBy = referrer.id;
    }
    const [user] = await tx
      .insert(users)
      .values({
        handle: input.handle,
        team: input.team,
        pendingEmail,
        referredBy,
        deviceFp: input.deviceFp?.slice(0, 64) || null,
      })
      .returning({ id: users.id })
      .catch((e: { code?: string }) => {
        if (e.code === "23505") throw new DomainError("BAD_STATE", "handle already taken");
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

  // Sent after commit: a delivery failure must not roll back the account.
  let verificationSent = false;
  if (pendingEmail && input.baseUrl) {
    await sendEmailLink(pendingEmail, input.baseUrl, "verify");
    verificationSent = true;
  }
  return { ...result, verificationSent };
}

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;

/**
 * Issue a one-time link to `email` and deliver it. Sign-in and verification
 * are the same primitive — both are "prove you can read this mailbox" — so
 * only the copy differs; the token is interchangeable.
 */
async function sendEmailLink(email: string, baseUrl: string, purpose: "signin" | "verify") {
  const token = randomBytes(32).toString("base64url");
  await db.insert(magicLinkTokens).values({
    email: email.toLowerCase(),
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
  });
  const url = `${baseUrl}/api/auth/magic-link/verify?token=${token}`;
  const copy =
    purpose === "verify"
      ? {
          subject: "Confirm your PopOrSlop email",
          text: `Confirm this address to secure your PopOrSlop account (link valid 15 minutes):\n\n${url}\n\nIf you didn't sign up, ignore this — the address stays unclaimed.`,
        }
      : {
          subject: "Your PopOrSlop sign-in link",
          text: `Sign in to PopOrSlop (link valid 15 minutes):\n\n${url}\n\nIf you didn't request this, ignore it.`,
        };
  const key = process.env.RESEND_API_KEY;
  if (key) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env.MAGIC_LINK_FROM ?? "PopOrSlop <login@poporslop.dev>",
        to: email,
        ...copy,
      }),
    });
    if (!res.ok) console.error(`[auth] resend failed: ${res.status} ${await res.text()}`);
  } else {
    console.log(`[auth] ${purpose} link for ${email} (no RESEND_API_KEY, dev mode):\n  ${url}`);
  }
}

/**
 * W1 magic-link flow. Request: store a hashed one-time token; delivery via
 * Resend when RESEND_API_KEY is set, console fallback in dev. The route
 * always answers 200 so account existence never leaks.
 */
export async function requestMagicLink(email: string, baseUrl: string): Promise<void> {
  await sendEmailLink(email.trim().toLowerCase(), baseUrl, "signin");
}

/**
 * Claim (or re-claim) an address for a signed-in account and send the
 * verification link. Nothing about the account changes until the link is
 * clicked — an unverified claim is just a note on the row.
 */
export async function requestEmailVerification(
  userId: string,
  email: string,
  baseUrl: string,
): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new DomainError("NOT_AUTHORIZED", "no such account");
  if (user.email === normalized && user.emailVerifiedAt) {
    throw new DomainError("BAD_STATE", "that address is already verified");
  }
  await db.update(users).set({ pendingEmail: normalized }).where(eq(users.id, userId));
  await sendEmailLink(normalized, baseUrl, "verify");
}

/** Mark `email` as this account's verified address, clearing the pending claim. */
async function markVerified(tx: Tx, userId: string, email: string): Promise<void> {
  await tx
    .update(users)
    .set({ email, pendingEmail: null, emailVerifiedAt: new Date() })
    .where(eq(users.id, userId))
    .catch((e: { code?: string }) => {
      if (e.code === "23505") {
        throw new DomainError("BAD_STATE", "that address already belongs to another account");
      }
      throw e;
    });
}

export type SessionUser = Awaited<ReturnType<typeof getSessionUser>>;

/**
 * Resolve a *proven* address to an account, creating one if needed.
 *
 * Kept separate from token consumption so any future sign-in method that can
 * prove mailbox ownership resolves identity the same way — two paths with
 * different notions of who owns an address is how accounts get duplicated.
 * Every branch stamps `email_verified_at`, because reaching here *is* the
 * proof:
 * - the address already owns an account → sign that account in;
 * - visitor is signed in to an account with no verified email → attach it
 *   (the account-merge path for event signups);
 * - some account is *pending* this address (signup claim) → promote it;
 * - otherwise → create a fresh funded account with a handle derived from the
 *   email local part.
 */
async function resolveProvenEmail(
  tx: Tx,
  email: string,
  currentUser: SessionUser,
): Promise<string> {
  const [owner] = await tx.select().from(users).where(eq(users.email, email));
  if (owner) {
    // Pre-verification accounts (and W0 event signups) get stamped on first proof.
    if (!owner.emailVerifiedAt) await markVerified(tx, owner.id, email);
    return owner.id;
  }

  if (currentUser && !currentUser.email && !currentUser.isSystem) {
    await markVerified(tx, currentUser.id, email);
    return currentUser.id;
  }

  const [claimant] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.pendingEmail, email))
    .orderBy(asc(users.createdAt))
    .limit(1);
  if (claimant) {
    await markVerified(tx, claimant.id, email);
    return claimant.id;
  }

  const base =
    email
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
    .values({ handle, email, emailVerifiedAt: new Date() })
    .returning({ id: users.id });
  await postEntries(tx, [
    { userId: SYSTEM.houseTreasury, delta: -SIGNUP_GRANT, reason: "SIGNUP_GRANT", refId: created!.id },
    { userId: created!.id, delta: SIGNUP_GRANT, reason: "SIGNUP_GRANT", refId: created!.id },
  ]);
  return created!.id;
}

async function issueSession(tx: Tx, userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await tx.insert(sessions).values({ userId, tokenHash: hashToken(token), expiresAt });
  return { token, expiresAt };
}

/** Verify a one-time email token (magic link or signup confirmation). */
export async function verifyMagicLink(
  token: string,
  currentUser: SessionUser,
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

    const userId = await resolveProvenEmail(tx, row.email, currentUser);
    return issueSession(tx, userId);
  });
}


/** Delete a session so its token stops working immediately. */
export async function revokeSession(token: string | undefined): Promise<void> {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
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
