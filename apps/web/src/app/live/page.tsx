"use client";

import { useEffect, useState } from "react";
import { fmtProb, fmtPts, fmtShares, fmtTime } from "~/lib/format";
import { trpc } from "~/lib/trpc";

/**
 * Big-screen route (spec §12.4): rotates flagship odds ↔ leaderboard, with a
 * live trade ticker below. Pure polling — resilient to venue wifi; a dropped
 * poll just means a stale screen for a few seconds, never a crash.
 */
export default function LivePage() {
  const markets = trpc.market.list.useQuery(undefined, { refetchInterval: 3000 });
  const board = trpc.portfolio.leaderboard.useQuery(undefined, { refetchInterval: 5000 });
  const ticker = trpc.market.ticker.useQuery({ limit: 12 }, { refetchInterval: 2000 });
  const stats = trpc.market.stats.useQuery(undefined, { refetchInterval: 10_000 });

  const flagships = (markets.data ?? [])
    .filter((m) => m.status === "OPEN" || m.status === "RESOLVED")
    .sort((a, b) => b.bPoints - a.bPoints)
    .slice(0, 3);

  const [panel, setPanel] = useState(0);
  const panels = flagships.length + 1; // each flagship + leaderboard
  useEffect(() => {
    const id = setInterval(() => setPanel((p) => (p + 1) % Math.max(1, panels)), 8000);
    return () => clearInterval(id);
  }, [panels]);

  const showLeaderboard = panel === flagships.length || flagships.length === 0;
  const market = showLeaderboard ? null : flagships[panel]!;

  return (
    <div className="fixed inset-0 flex flex-col bg-bg p-8 text-ink">
      <header className="flex items-baseline justify-between">
        <h1 className="text-3xl font-black tracking-tight text-accent">PopOrSlop</h1>
        <p className="text-xl text-muted">
          {stats.data ? `${stats.data.traders} traders · ${stats.data.trades} trades` : ""}
          <span className="ml-6 text-accent">scan the QR → join → trade</span>
        </p>
      </header>

      <div className="flex flex-1 items-center justify-center">
        {showLeaderboard ? (
          <div className="w-full max-w-3xl">
            <h2 className="mb-6 text-4xl font-bold">Leaderboard</h2>
            <ol className="space-y-3">
              {(board.data?.allTime ?? []).slice(0, 8).map((r, i) => (
                <li key={r.handle} className="flex items-center gap-4 text-3xl">
                  <span className="w-10 text-right font-mono text-faint">{i + 1}</span>
                  <span className="font-semibold">@{r.handle}</span>
                  {r.team && <span className="rounded bg-surface-2 px-2 text-xl text-muted">{r.team}</span>}
                  <span
                    className={`ml-auto font-mono ${r.pnl >= 0n ? "text-pos" : "text-neg"}`}
                  >
                    {r.pnl >= 0n ? "+" : ""}
                    {fmtPts(r.pnl)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ) : market ? (
          <div className="w-full max-w-4xl">
            <h2 className="mb-6 text-4xl font-bold">{market.title}</h2>
            <div className="space-y-3">
              {market.outcomes
                .map((o, i) => ({ o, p: market.pricesMicro?.[i] ?? 0, i }))
                .sort((a, b) => b.p - a.p)
                .slice(0, 8)
                .map(({ o, p, i }) => (
                  <div key={i} className="flex items-center gap-4 text-3xl">
                    <span className="w-2/5 truncate font-semibold">{o}</span>
                    <div className="h-8 flex-1 overflow-hidden rounded bg-surface-2">
                      <div
                        className={`h-full ${market.resolvedOutcome === i ? "bg-accent" : "bg-accent"}`}
                        style={{ width: `${Math.max(1, p / 10_000)}%` }}
                      />
                    </div>
                    <span className="w-24 text-right font-mono text-accent">
                      {fmtProb(p, 0)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        ) : null}
      </div>

      <footer className="h-12 overflow-hidden border-t border-line pt-2">
        <div className="flex gap-8 whitespace-nowrap text-lg text-muted">
          {(ticker.data ?? []).map((t) => (
            <span key={String(t.id)}>
              <span className="text-faint">{fmtTime(t.ts)}</span> @{t.handle}{" "}
              {t.selfFlagged && <span className="text-warn">⚑</span>}
              <span className={t.deltaShares > 0n ? "text-pos" : "text-neg"}>
                {" "}
                {t.deltaShares > 0n ? "▲" : "▼"} {fmtShares(t.deltaShares < 0n ? -t.deltaShares : t.deltaShares)}
              </span>{" "}
              {t.market?.outcomes[t.outcomeIdx] ?? ""}
            </span>
          ))}
        </div>
      </footer>
    </div>
  );
}
