import "dotenv/config";
import { db, pool } from "../src/server/db/client";
import { quests } from "../src/server/db/schema";

/**
 * Default quest set. Edit freely — quests are admin-manageable in the console
 * too. Real partners only: a placeholder quest is worse than no quest, because
 * it's an unclaimable reward sitting at the top of the list.
 */
async function main() {
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
        slug: q.slug,
        title: q.title,
        description: q.description,
        kind: q.kind,
        reward: q.reward,
        url: "url" in q ? q.url : null,
        rule: "rule" in q ? q.rule : null,
        autoApproveAfterS: "autoApproveAfterS" in q ? q.autoApproveAfterS : null,
        // No code quests in the default set; the admin console creates those,
        // since the code has to come from a partner who actually issues it.
        codeHash: null,
      })
      .onConflictDoNothing();
    console.log(`quest: ${q.slug} (+${q.reward / 1_000_000n} pts)`);
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
