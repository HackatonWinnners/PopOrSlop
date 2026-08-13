import "dotenv/config";

/**
 * List a paying startup: create the company row if it doesn't exist yet, then
 * put its token on the bonding curve.
 *
 * The gap this fills: companies only ever arrived via snapshot-cohort, so a
 * customer who paid through /list-your-startup had no path onto the site
 * except a hand-written INSERT. The listing itself goes through listStartup,
 * so the treasury subsidy, the startup's holding account and the opening
 * token_trades row are all created the same way they are in the admin console.
 *
 *   pnpm tsx scripts/list-startup.ts --name "Dragon Rental" --payment 500 \
 *     --db postgres --yes
 *
 * --payment is the fee in whole currency units, recorded on the company and
 * used for the launch price. Omit --yes for a dry run.
 */

const argv = process.argv.slice(2);
const arg = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const flag = (name: string) => argv.includes(`--${name}`);

// Must happen before db/client is imported — it reads DATABASE_URL at load.
const dbName = arg("db");
if (dbName) {
  const url = new URL(process.env.DATABASE_URL ?? "");
  url.pathname = `/${dbName}`;
  process.env.DATABASE_URL = url.toString();
}

const { listingDefaults, tokenPrice, tokenTradeCost } = await import("@poporslop/lmsr");
const { eq } = await import("drizzle-orm");
const { db, pool } = await import("../src/server/db/client");
const { companies } = await import("../src/server/db/schema");
const { DEFAULT_ALLOCATION_TOKENS, listStartup } = await import("../src/server/services/tokens");

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "startup";

async function main() {
  const name = arg("name");
  const payment = Number(arg("payment"));
  if (!name || !Number.isFinite(payment)) {
    throw new Error(
      'usage: --name "<company>" --payment <amount> [--slug <s>] [--jurisdiction DE] ' +
        "[--description <text>] [--logo <url>] [--db <name>] [--yes]",
    );
  }

  const slug = arg("slug") ?? slugify(name);
  const { p0, slope } = listingDefaults(payment);

  const [existing] = await db.select().from(companies).where(eq(companies.slug, slug));
  if (existing?.listedAt) throw new Error(`${slug} is already listed`);

  console.log(`${name}  →  /s/${slug}`);
  console.log(`  company     ${existing ? "exists" : "will be created"}`);
  console.log(`  payment     ${payment}`);
  console.log(`  launch      ${Number(p0) / 1e6} pts/token   slope ${Number(slope) / 1e6}`);
  const alloc = DEFAULT_ALLOCATION_TOKENS;
  console.log(`  allocation  ${Number(alloc) / 1e6} tokens to the startup's account`);
  console.log(`  price after allocation  ${Number(tokenPrice({ supply: alloc, p0, slope })) / 1e6} pts/token`);
  console.log(`  treasury subsidy  ${Number(tokenTradeCost({ supply: 0n, p0, slope }, alloc)) / 1e6} pts`);

  if (!flag("yes")) {
    console.log("\ndry run — re-run with --yes to list it");
    return;
  }

  let companyId = existing?.id;
  if (!companyId) {
    const [created] = await db
      .insert(companies)
      .values({
        name,
        slug,
        jurisdiction: arg("jurisdiction") ?? null,
        description: arg("description") ?? null,
        logoUrl: arg("logo") ?? null,
      })
      .returning({ id: companies.id });
    companyId = created!.id;
    console.log(`\ncompany created  ${companyId}`);
  }

  const website = arg("website");
  await listStartup({
    companyId,
    paymentUsd: payment,
    description: arg("description"),
    logoUrl: arg("logo"),
    links: website ? { website } : undefined,
  });

  const [row] = await db.select().from(companies).where(eq(companies.id, companyId));
  console.log(`listed  ${row!.name}  /s/${row!.slug}  at ${row!.listedAt?.toISOString()}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
