"use client";

import Link from "next/link";
import { fmtProb } from "~/lib/format";
import { trpc } from "~/lib/trpc";

const STATUS_LABEL: Record<string, string> = {
  OPEN: "open",
  LOCKED: "locked",
  DISPUTE_WINDOW: "resolving",
  ESCALATED: "disputed",
  RESOLVED: "resolved",
  NA_REFUNDED: "N/A refund",
};

export default function HomePage() {
  const markets = trpc.market.list.useQuery(undefined, { refetchInterval: 5000 });

  return (
    <div className="space-y-3">
      <header className="py-2">
        <h1 className="text-xl font-bold">Markets</h1>
        <p className="text-sm text-zinc-400">
          Play-money odds on real outcomes. Every contract resolves against a public source of truth.
        </p>
      </header>
      {markets.data?.length === 0 && (
        <p className="rounded border border-zinc-800 p-6 text-center text-zinc-500">
          No markets listed yet.
        </p>
      )}
      {markets.data?.map((m) => {
        const top = m.pricesMicro
          ? m.outcomes
              .map((o, i) => ({ o, p: m.pricesMicro![i]! }))
              .sort((a, b) => b.p - a.p)
              .slice(0, 3)
          : [];
        return (
          <Link
            key={m.id}
            href={`/m/${m.slug}`}
            className="block rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 hover:border-zinc-600"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-semibold">{m.title}</h2>
              <span
                className={`shrink-0 rounded px-2 py-0.5 text-xs ${
                  m.status === "OPEN"
                    ? "bg-emerald-950 text-emerald-400"
                    : m.status === "RESOLVED"
                      ? "bg-zinc-800 text-zinc-400"
                      : "bg-amber-950 text-amber-400"
                }`}
              >
                {STATUS_LABEL[m.status] ?? m.status}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              {m.status === "RESOLVED" && m.resolvedOutcome !== null ? (
                <span className="text-zinc-300">
                  → <b>{m.outcomes[m.resolvedOutcome]}</b>
                </span>
              ) : (
                top.map(({ o, p }) => (
                  <span key={o} className="rounded bg-zinc-800 px-2 py-0.5">
                    {o} <b className="text-emerald-300">{fmtProb(p, 0)}</b>
                  </span>
                ))
              )}
              {m.outcomes.length > 3 && m.status !== "RESOLVED" && (
                <span className="text-zinc-500">+{m.outcomes.length - 3} more</span>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
