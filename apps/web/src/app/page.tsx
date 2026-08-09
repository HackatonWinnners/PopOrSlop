"use client";

import Link from "next/link";
import { fmtPts } from "~/lib/format";
import { trpc } from "~/lib/trpc";

/** Home: the startup-centered surface. Listed startups (tradable tokens) first. */
export default function StartupsPage() {
  const startups = trpc.startup.list.useQuery(undefined, { refetchInterval: 10_000 });

  const listed = (startups.data ?? []).filter((s) => s.listed);
  const rest = (startups.data ?? []).filter((s) => !s.listed);

  return (
    <div className="space-y-6">
      <header className="py-2">
        <h1 className="text-xl font-bold">Startups</h1>
        <p className="text-sm text-zinc-400">
          Every startup has a profile, a tradable token, and prediction markets that resolve
          against public records. Points only — no monetary value, ever.
        </p>
      </header>

      {listed.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-emerald-400">Listed — token live</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {listed.map((s) => (
              <Link
                key={s.id}
                href={`/s/${s.slug}`}
                className="rounded-lg border border-emerald-900 bg-zinc-900/50 p-3 hover:border-emerald-600"
              >
                <div className="flex items-center gap-2">
                  {s.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.logoUrl} alt="" className="h-8 w-8 rounded bg-zinc-800 object-cover" />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-zinc-800 text-sm font-bold">
                      {s.name[0]}
                    </div>
                  )}
                  <span className="truncate font-semibold">{s.name}</span>
                </div>
                <p className="mt-2 font-mono text-sm text-emerald-300">
                  {fmtPts(s.priceMicro)} pts / token
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-400">
          Tracked — markets only ({rest.length})
        </h2>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {rest.map((s) => (
            <Link
              key={s.id}
              href={`/s/${s.slug}`}
              className="truncate rounded border border-zinc-800 bg-zinc-900/40 px-2.5 py-1.5 text-sm hover:border-zinc-600"
            >
              {s.name}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
