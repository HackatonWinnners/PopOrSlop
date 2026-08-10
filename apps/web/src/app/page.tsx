"use client";

import Link from "next/link";
import { Card, Empty, Logo, PageHeader, SectionLabel } from "~/components/ui";
import { fmtPts } from "~/lib/format";
import { trpc } from "~/lib/trpc";

/** Home: the startup-centered surface. Listed startups (tradable tokens) first. */
export default function StartupsPage() {
  const startups = trpc.startup.list.useQuery(undefined, { refetchInterval: 10_000 });

  const listed = (startups.data ?? []).filter((s) => s.listed);
  const tracked = (startups.data ?? []).filter((s) => !s.listed);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          title="Startups"
          blurb="Every startup has a profile, a tradable token, and prediction markets that resolve against public records. Points only — no monetary value, ever."
        />
        {/* Founders land here first — the grid is the pitch, so the ask goes
            next to it rather than buried in a footer nobody reaches. */}
        <Link
          href="/list-your-startup"
          className="mb-6 shrink-0 rounded-[var(--radius-control)] border border-accent px-4 py-2 text-sm font-semibold text-accent hover:bg-accent-soft"
        >
          Are you a startup? Get listed →
        </Link>
      </div>

      <section>
        <SectionLabel index="01">Listed — token live</SectionLabel>
        {listed.length === 0 ? (
          <Empty>No startups listed yet.</Empty>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {listed.map((s) => (
              <Link key={s.id} href={`/s/${s.slug}`} className="group">
                <Card className="h-full p-4 transition-colors group-hover:border-accent">
                  <div className="flex items-center gap-2.5">
                    <Logo name={s.name} url={s.logoUrl} />
                    <span className="truncate font-semibold">{s.name}</span>
                  </div>
                  <p className="tnum mt-3 text-xl text-accent">
                    {fmtPts(s.priceMicro)} <span className="text-xs text-faint">pts / token</span>
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionLabel index="02">Tracked — markets only ({tracked.length})</SectionLabel>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
          {tracked.map((s) => (
            <Link
              key={s.id}
              href={`/s/${s.slug}`}
              className="truncate rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-sm hover:border-line-strong hover:text-accent"
            >
              {s.name}
            </Link>
          ))}
        </div>
      </section>

      <footer className="flex gap-5 border-t border-line pt-5 text-sm">
        <Link href="/batch-odds" className="text-accent hover:underline">
          Batch odds — public data
        </Link>
        <Link href="/live" className="text-accent hover:underline">
          Big-screen mode
        </Link>
      </footer>
    </div>
  );
}
