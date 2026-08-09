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
        <h1 className="page-title text-3xl font-bold tracking-tight">Markets</h1>
        <p className="text-sm text-muted">
          Play-money odds on real outcomes. Every contract resolves against a public source of truth.
        </p>
      </header>
      {markets.data?.length === 0 && (
        <p className="rounded border border-line p-6 text-center text-faint">
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
            className="block rounded-lg border border-line bg-surface p-4 hover:border-line-strong"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-semibold">{m.title}</h2>
              <span
                className={`shrink-0 rounded px-2 py-0.5 text-xs ${
                  m.status === "OPEN"
                    ? "bg-accent-soft text-accent"
                    : m.status === "RESOLVED"
                      ? "bg-surface-2 text-muted"
                      : "bg-warn-bg text-warn"
                }`}
              >
                {STATUS_LABEL[m.status] ?? m.status}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              {m.status === "RESOLVED" && m.resolvedOutcome !== null ? (
                <span className="text-ink-2">
                  → <b>{m.outcomes[m.resolvedOutcome]}</b>
                </span>
              ) : (
                top.map(({ o, p }) => (
                  <span key={o} className="rounded bg-surface-2 px-2 py-0.5">
                    {o} <b className="text-accent">{fmtProb(p, 0)}</b>
                  </span>
                ))
              )}
              {m.outcomes.length > 3 && m.status !== "RESOLVED" && (
                <span className="text-faint">+{m.outcomes.length - 3} more</span>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
