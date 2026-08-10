import "dotenv/config";
import { db, pool } from "../src/server/db/client";
import { quests } from "../src/server/db/schema";
import { hashQuestCode } from "../src/server/services/quests";

/**
 * Default quest set. Edit freely — quests are admin-manageable in the
 * console too. The partner-app quest code is printed once; share it with
 * the partner so their app can show it after signup.
 */
async function main() {
  const partnerCode = process.env.PARTNER_QUEST_CODE ?? `POPS-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  const rows = [
    {
      slug: "first-trade",
      title: "Place your first trade",
      description: "Buy shares in any open market. Claim here afterwards.",
      kind: "auto",
      rule: "first_trade",
      reward: 50n * 1_000_000n,
    },
    {
      slug: "keep-your-account",
      title: "Verify your email",
      description: "Confirm your address from the link we email you, so your account survives the event.",
      kind: "auto",
      rule: "email_verified",
      reward: 100n * 1_000_000n,
    },
    {
      slug: "diversify",
      title: "Trade three different markets",
      description: "Hold or have traded positions in at least 3 distinct markets.",
      kind: "auto",
      rule: "traded_3_markets",
      reward: 150n * 1_000_000n,
    },
    {
      slug: "partner-app-signup",
      title: "Sign up for our partner app",
      description:
        "Create an account on the partner app and finish its onboarding — it will show you a redemption code at the end. Enter it here.",
      url: "https://example-partner.app/signup?utm_source=poporslop",
      kind: "code",
      codeHash: hashQuestCode(partnerCode),
      reward: 1000n * 1_000_000n,
    },
    {
      slug: "facestic-sticker",
      title: "Make a sticker with Facestic",
      description:
        "Open @facestic_bot on Telegram and generate at least one sticker, then claim here. Your claim clears automatically a few minutes later.",
      url: "https://t.me/facestic_bot",
      kind: "manual",
      // No postback from Facestic yet, so the claim self-approves on a timer.
      // Swap this to null the day we can actually check a sticker was made.
      autoApproveAfterS: 300,
      reward: 500n * 1_000_000n,
    },
    {
      slug: "spread-the-word",
      title: "Post about a market you traded",
      description:
        "Share any market on X/HN/LinkedIn with your take. Paste the link as proof — an admin reviews it.",
      kind: "manual",
      reward: 250n * 1_000_000n,
    },
  ] as const;

  for (const q of rows) {
    await db
      .insert(quests)
      .values({
        ...q,
        url: "url" in q ? q.url : null,
        rule: "rule" in q ? q.rule : null,
        codeHash: "codeHash" in q ? q.codeHash : null,
        autoApproveAfterS: "autoApproveAfterS" in q ? q.autoApproveAfterS : null,
      })
      .onConflictDoNothing();
    console.log(`quest: ${q.slug} (+${q.reward / 1_000_000n} pts)`);
  }
  console.log(`\npartner redemption code (share with the partner app): ${partnerCode}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
