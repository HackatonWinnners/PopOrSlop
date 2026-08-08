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
        <h1 className="text-xl font-bold">Leaderboard</h1>
        <div className="flex overflow-hidden rounded border border-zinc-700 text-sm">
          <button
            onClick={() => setWindow("allTime")}
            className={`px-3 py-1 ${window_ === "allTime" ? "bg-zinc-700 font-semibold" : ""}`}
          >
            All-time
          </button>
          <button
            onClick={() => setWindow("last90")}
            className={`px-3 py-1 ${window_ === "last90" ? "bg-zinc-700 font-semibold" : ""}`}
          >
            90 days
          </button>
        </div>
      </header>
      <p className="text-xs text-zinc-500">
        Realized P&L: trading cash flow + payouts. Open positions count at cost until they resolve.
      </p>
      <ol className="divide-y divide-zinc-800/60">
        {rows.map((r, i) => (
          <li key={r.handle} className="flex items-center gap-3 py-2 text-sm">
            <span className="w-6 text-right font-mono text-zinc-500">{i + 1}</span>
            <a href={`/u/${r.handle}`} className="font-medium hover:underline">
              @{r.handle}
            </a>
            {r.team && <span className="rounded bg-zinc-800 px-1 text-xs text-zinc-400">{r.team}</span>}
            <span
              className={`ml-auto font-mono ${r.pnl >= 0n ? "text-emerald-400" : "text-red-400"}`}
            >
              {r.pnl >= 0n ? "+" : ""}
              {fmtPts(r.pnl)} pts
            </span>
          </li>
        ))}
        {rows.length === 0 && <p className="py-6 text-center text-zinc-500">No trades yet.</p>}
      </ol>
    </div>
  );
}
