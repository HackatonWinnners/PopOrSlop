import "dotenv/config";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/server/db/client";
import { cohorts, companies } from "../src/server/db/schema";

/**
 * Freeze a YC batch as a cohort snapshot (spec §5.2: cohort membership is
 * frozen at listing, hash stored; later directory changes don't move the
 * index). Source: the yc-oss community mirror of the public YC directory.
 *
 * Usage:
 *   pnpm tsx scripts/snapshot-cohort.ts "Summer 2026"          # batch name
 *   pnpm tsx scripts/snapshot-cohort.ts <name> <url>           # explicit URL
 */
interface YcCompany {
  name: string;
  slug?: string;
  website?: string;
  batch?: string;
  all_locations?: string;
}

async function main() {
  const batchName = process.argv[2];
  if (!batchName) throw new Error('usage: snapshot-cohort.ts "Summer 2026" [url]');
  const slug = batchName.toLowerCase().replace(/\s+/g, "-");
  const url = process.argv[3] ?? `https://yc-oss.github.io/api/batches/${slug}.json`;

  console.log(`fetching ${url}`);
  const res = await fetch(url, { headers: { "user-agent": "PopOrSlop cohort snapshot" } });
  if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status} — is the batch published yet?`);
  const raw = await res.text();
  const list = JSON.parse(raw) as YcCompany[];
  if (!Array.isArray(list) || list.length === 0) throw new Error("empty/unexpected payload");

  const hash = createHash("sha256").update(raw, "utf8").digest("hex");

  const [existing] = await db.select().from(cohorts).where(eq(cohorts.name, batchName));
  if (existing?.frozenAt) {
    console.log(`cohort "${batchName}" already frozen at ${existing.frozenAt.toISOString()} (hash ${existing.snapshotHash?.slice(0, 12)}…) — immutable, aborting`);
    await pool.end();
    return;
  }

  const cohortId = await db.transaction(async (tx) => {
    const [cohort] = await tx
      .insert(cohorts)
      .values({
        name: batchName,
        sourceUrl: url,
        snapshot: list,
        snapshotHash: hash,
        frozenAt: new Date(),
      })
      .returning({ id: cohorts.id });

    const taken = new Set<string>();
    for (const c of list) {
      const domain = c.website?.replace(/^https?:\/\//, "").replace(/\/.*$/, "") || undefined;
      // Profile slug: slugified name, deduped within this run (DB unique index
      // is the backstop across runs).
      const base = c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "startup";
      let slug = base;
      for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
      taken.add(slug);
      await tx.insert(companies).values({
        name: c.name,
        slug,
        jurisdiction: c.all_locations?.includes("Germany") ? "DE" : c.all_locations?.includes("United Kingdom") ? "UK" : "US",
        cohortId: cohort!.id,
        extIds: { yc_slug: c.slug, domain },
      });
    }
    return cohort!.id;
  });

  console.log(`✓ cohort "${batchName}" frozen: ${list.length} companies, sha256 ${hash.slice(0, 16)}…, id ${cohortId}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
