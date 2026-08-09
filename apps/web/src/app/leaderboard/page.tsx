"use client";

import { useState } from "react";
import { fmtPts } from "~/lib/format";
import { trpc } from "~/lib/trpc";

export default function LeaderboardPage() {
  const board = trpc.portfolio.leaderboard.useQuery(undefined, { refetchInterval: 5000 });
  const [window_, setWindow] = useState<"allTime" | "last90">("allTime");
  const rows = board.data?.[window_] ?? [];

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between py-2">
        <h1 className="page-title text-3xl font-bold tracking-tight">Leaderboard</h1>
        <div className="flex overflow-hidden rounded border border-line-strong text-sm">
          <button
            onClick={() => setWindow("allTime")}
            className={`px-3 py-1 ${window_ === "allTime" ? "bg-surface-3 font-semibold" : ""}`}
          >
            All-time
          </button>
          <button
            onClick={() => setWindow("last90")}
            className={`px-3 py-1 ${window_ === "last90" ? "bg-surface-3 font-semibold" : ""}`}
          >
            90 days
          </button>
        </div>
      </header>
      <p className="text-xs text-faint">
        Realized P&L: trading cash flow + payouts. Open positions count at cost until they resolve.
      </p>
      <ol className="divide-y divide-line">
        {rows.map((r, i) => (
          <li key={r.handle} className="flex items-center gap-3 py-2 text-sm">
            <span className="w-6 text-right font-mono text-faint">{i + 1}</span>
            <a href={`/u/${r.handle}`} className="font-medium hover:underline">
              @{r.handle}
            </a>
            {r.team && <span className="rounded bg-surface-2 px-1 text-xs text-muted">{r.team}</span>}
            <span
              className={`ml-auto font-mono ${r.pnl >= 0n ? "text-pos" : "text-neg"}`}
            >
              {r.pnl >= 0n ? "+" : ""}
              {fmtPts(r.pnl)} pts
            </span>
          </li>
        ))}
        {rows.length === 0 && <p className="py-6 text-center text-faint">No trades yet.</p>}
      </ol>
    </div>
  );
}
