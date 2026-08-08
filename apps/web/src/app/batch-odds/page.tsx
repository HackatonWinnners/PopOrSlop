"use client";

import Link from "next/link";
import { useState } from "react";
import { fmtProb } from "~/lib/format";
import { trpc } from "~/lib/trpc";

/**
 * The public data-product teaser (spec §9): live implied batch rankings +
 * the VC waitlist for the paid odds API.
 */
export default function BatchOddsPage() {
  const odds = trpc.market.batchOdds.useQuery(undefined, { refetchInterval: 10_000 });

  return (
    <div className="space-y-6">
      <header className="py-2">
        <h1 className="text-xl font-bold">Batch Odds</h1>
        <p className="text-sm text-zinc-400">
          Market-implied odds on the S26 accelerator batch, aggregated from forecasters with
          skin-in-the-game points. Every market resolves against public records.
        </p>
      </header>

      {odds.data?.index && (
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <Link href={`/m/${odds.data.index.slug}`} className="font-semibold hover:underline">
            {odds.data.index.title}
          </Link>
          <div className="mt-3 space-y-2">
            {odds.data.index.outcomes.map((o, i) => {
              const p = odds.data!.index!.pricesMicro?.[i] ?? 0;
              return (
                <div key={o} className="flex items-center gap-3 text-sm">
                  <span className="w-16">{o}</span>
                  <div className="h-4 flex-1 overflow-hidden rounded bg-zinc-800">
                    <div className="h-full bg-emerald-600" style={{ width: `${Math.max(1, p / 10_000)}%` }} />
                  </div>
                  <span className="w-14 text-right font-mono text-emerald-300">{fmtProb(p, 1)}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 font-mono text-xs text-zinc-600">
            cohort frozen at listing — sha256 {odds.data.index.criteriaHash.slice(0, 16)}…
          </p>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-400">
          Implied ranking — P(raises ≥ $5M by mid-2027)
        </h2>
        <ol className="divide-y divide-zinc-800/60">
          {(odds.data?.ranking ?? []).map((r, i) => (
            <li key={r.slug} className="flex items-center gap-3 py-2 text-sm">
              <span className="w-6 text-right font-mono text-zinc-500">{i + 1}</span>
              <Link href={`/m/${r.slug}`} className="font-medium hover:underline">
                {r.company}
              </Link>
              {r.status !== "OPEN" && (
                <span className="rounded bg-zinc-800 px-1.5 text-xs text-zinc-500">{r.status}</span>
              )}
              <span className="ml-auto font-mono text-emerald-300">{fmtProb(r.yesMicro, 1)}</span>
            </li>
          ))}
        </ol>
      </section>

      <WaitlistForm />
    </div>
  );
}

function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [fund, setFund] = useState("");
  const join = trpc.waitlist.join.useMutation();

  if (join.isSuccess) {
    return (
      <p className="rounded border border-emerald-900 bg-emerald-950/40 p-4 text-sm text-emerald-300">
        You're on the list — we'll reach out when the odds API opens.
      </p>
    );
  }

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <h2 className="font-semibold">Want this as an API?</h2>
      <p className="mt-1 text-sm text-zinc-400">
        Odds API, movement alerts, and a weekly implied-rankings brief for funds — join the
        waitlist for the paid tier.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          join.mutate({ email, fundName: fund || undefined });
        }}
        className="mt-3 flex flex-wrap gap-2"
      >
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@fund.com"
          className="min-w-48 flex-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
        />
        <input
          value={fund}
          onChange={(e) => setFund(e.target.value)}
          placeholder="Fund (optional)"
          className="min-w-40 flex-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
        />
        <button
          disabled={join.isPending}
          className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
        >
          Join waitlist
        </button>
      </form>
    </section>
  );
}
