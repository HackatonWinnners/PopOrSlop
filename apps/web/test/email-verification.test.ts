import { pts } from "@poporslop/lmsr";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/server/db/client";
import { magicLinkTokens, quests, users } from "../src/server/db/schema";
import {
  getSessionUser,
  requestEmailVerification,
  requestMagicLink,
  signup,
  verifyMagicLink,
} from "../src/server/services/auth";
import { checkInvariants } from "../src/server/services/invariants";
import { claimQuest } from "../src/server/services/quests";
import { resetDb } from "./helpers";

/**
 * Tokens are stored hashed, so the raw value can't be read back from the DB.
 * With no RESEND_API_KEY the service logs the link instead of mailing it —
 * intercept that, exactly like reading the dev console.
 */
async function mintLink(email: string, send: () => Promise<unknown>): Promise<string> {
  const before = await db.select().from(magicLinkTokens);
  const logged: string[] = [];
  const orig = console.log;
  console.log = (...args: unknown[]) => logged.push(args.join(" "));
  try {
    await send();
  } finally {
    console.log = orig;
  }
  const after = await db.select().from(magicLinkTokens);
  expect(after.length).toBe(before.length + 1);
  const m = logged.join("\n").match(/token=([A-Za-z0-9_-]+)/);
  expect(m, `no link logged for ${email}`).toBeTruthy();
  return m![1]!;
}

async function byHandle(handle: string) {
  const [u] = await db.select().from(users).where(eq(users.handle, handle));
  return u!;
}

describe("email verification", () => {
  beforeEach(resetDb);

  it("signup parks the address in pending_email — the unique slot stays free", async () => {
    await signup({ handle: "squatter", email: "victim@example.com" });
    const squatter = await byHandle("squatter");
    expect(squatter.email).toBeNull();
    expect(squatter.pendingEmail).toBe("victim@example.com");
    expect(squatter.emailVerifiedAt).toBeNull();

    // The real owner can still claim the address, because it was never taken.
    await signup({ handle: "victim", email: "victim@example.com" });
    const victim = await byHandle("victim");
    expect(victim.pendingEmail).toBe("victim@example.com");
    await expectClean();
  });

  it("clicking the link promotes the pending claim and stamps verification", async () => {
    const { userId } = await signup({ handle: "ada", email: "Ada@Example.com" });
    const token = await mintLink("ada@example.com", () =>
      requestEmailVerification(userId, "ada@example.com", "http://x"),
    );

    await verifyMagicLink(token, null);
    const ada = await byHandle("ada");
    expect(ada.email).toBe("ada@example.com");
    expect(ada.pendingEmail).toBeNull();
    expect(ada.emailVerifiedAt).toBeInstanceOf(Date);
    await expectClean();
  });

  it("a second claimant of a verified address cannot take it", async () => {
    const { userId: ownerId } = await signup({ handle: "owner", email: "shared@example.com" });
    const t1 = await mintLink("shared@example.com", () =>
      requestEmailVerification(ownerId, "shared@example.com", "http://x"),
    );
    await verifyMagicLink(t1, null);

    const { userId: lateId } = await signup({ handle: "latecomer", email: "shared@example.com" });
    const t2 = await mintLink("shared@example.com", () =>
      requestEmailVerification(lateId, "shared@example.com", "http://x"),
    );
    // The link proves the mailbox, so it signs them into the account that
    // owns it rather than moving the address.
    const session = await verifyMagicLink(t2, null);
    const signedIn = await getSessionUser(session.token);
    expect(signedIn!.handle).toBe("owner");
    expect((await byHandle("latecomer")).email).toBeNull();
    await expectClean();
  });

  it("signing in by magic link verifies a handle-only account (merge path)", async () => {
    const { userId, token: sessionToken } = await signup({ handle: "eventgoer" });
    const current = await getSessionUser(sessionToken);
    const link = await mintLink("eventgoer@example.com", () =>
      requestMagicLink("eventgoer@example.com", "http://x"),
    );

    await verifyMagicLink(link, current);
    const u = await byHandle("eventgoer");
    expect(u.id).toBe(userId);
    expect(u.email).toBe("eventgoer@example.com");
    expect(u.emailVerifiedAt).toBeInstanceOf(Date);
    await expectClean();
  });

  it("an unknown address still creates a funded, verified account", async () => {
    const link = await mintLink("new@example.com", () =>
      requestMagicLink("new@example.com", "http://x"),
    );
    const session = await verifyMagicLink(link, null);
    const u = (await getSessionUser(session.token))!;
    expect(u.email).toBe("new@example.com");
    expect(u.emailVerifiedAt).toBeInstanceOf(Date);
    expect(u.pointsBalance).toBe(pts(1000));
    await expectClean();
  });

  it("a used or expired link is refused", async () => {
    const link = await mintLink("once@example.com", () =>
      requestMagicLink("once@example.com", "http://x"),
    );
    await verifyMagicLink(link, null);
    await expect(verifyMagicLink(link, null)).rejects.toThrow(/invalid or expired/);
  });

  it("the email quest pays only after verification, not on a typed-in address", async () => {
    await db.insert(quests).values({
      slug: "keep-your-account",
      title: "Verify your email",
      description: "test",
      kind: "auto",
      rule: "email_verified",
      reward: pts(100),
    });
    const { userId } = await signup({ handle: "farmer", email: "farmer@example.com" });
    await expect(claimQuest({ userId, questSlug: "keep-your-account" })).rejects.toThrow(
      /not met/,
    );

    const link = await mintLink("farmer@example.com", () =>
      requestEmailVerification(userId, "farmer@example.com", "http://x"),
    );
    await verifyMagicLink(link, null);
    expect(await claimQuest({ userId, questSlug: "keep-your-account" })).toEqual({
      status: "approved",
    });
    expect((await byHandle("farmer")).pointsBalance).toBe(pts(1100));
    await expectClean();
  });
});

async function expectClean() {
  expect(await checkInvariants()).toEqual([]);
}
