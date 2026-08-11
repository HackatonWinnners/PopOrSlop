"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, Empty } from "~/components/ui";
import { fmtPts } from "~/lib/format";
import { SUMMERUP_MARKET_SLUG } from "~/lib/summerup-teams";
import { trpc } from "~/lib/trpc";

type BoardKey = "net" | "summerup" | "realized" | "realized90";

/**
 * Four boards, one trading record. `net` leads because it's the only one that
 * reads correctly before markets resolve — see the leaderboard resolver for
 * why realized-only ranks whoever traded least.
 */
const BOARDS: { key: BoardKey; tab: string; blurb: string }[] = [
  {
    key: "net",
    tab: "Net P&L",
    blurb:
      "Profit banked plus what open positions are worth right now. Free points — grants, drip, referrals, quests — never count.",
  },
  {
    key: "summerup",
    tab: "SummerUp €100",
    blurb:
      "Profit on the SummerUp winner market alone. Provisional: the €100 is awarded on these standings once the market resolves, not on today's marks.",
  },
  {
    key: "realized",
    tab: "Realized",
    blurb:
      "Cash actually banked — closed-out positions only. Open positions count for nothing here, so this runs negative until markets resolve.",
  },
  {
    key: "realized90",
    tab: "90 days",
    blurb: "Realized cash over the last 90 days.",
  },
];

export default function LeaderboardPage() {
  const board = trpc.portfolio.leaderboard.useQuery(undefined, { refetchInterval: 5000 });
  const [key, setKey] = useState<BoardKey>("net");
  const rows = board.data?.[key] ?? [];
  const active = BOARDS.find((b) => b.key === key)!;

  return (
    <div className="space-y-4">
      <header className="py-2">
        <h1 className="page-title text-3xl font-bold tracking-tight">Leaderboard</h1>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {BOARDS.map((b) => (
          <button
            key={b.key}
            onClick={() => setKey(b.key)}
            className={`rounded-[var(--radius-control)] border px-3 py-1.5 text-sm ${
              key === b.key
                ? "border-accent bg-accent-soft font-semibold text-accent"
                : "border-line text-muted hover:border-line-strong"
            }`}
          >
            {b.tab}
          </button>
        ))}
      </div>

      <p className="text-xs text-faint">{active.blurb}</p>

      {key === "summerup" && (
        <Card className="border-accent/40 p-3 text-xs text-muted">
          <b className="text-ink">€100 to the top of this board</b> when{" "}
          <Link href={`/m/${SUMMERUP_MARKET_SLUG}`} className="text-accent hover:underline">
            the winner market
          </Link>{" "}
          resolves. Marks move until then, so a lead today is not the prize.
        </Card>
      )}

      {board.isLoading && <p className="py-6 text-faint">Loading…</p>}

      {!board.isLoading && rows.length === 0 && <Empty>No trades on this board yet.</Empty>}

      <ol className="divide-y divide-line">
        {rows.map((r, i) => (
          <li key={r.handle} className="flex items-center gap-3 py-2 text-sm">
            <span className="tnum w-6 shrink-0 text-right text-faint">{i + 1}</span>
            <Link href={`/u/${r.handle}`} className="truncate font-medium hover:underline">
              @{r.handle}
            </Link>
            {r.team && (
              <span className="shrink-0 rounded bg-surface-2 px-1 text-xs text-muted">{r.team}</span>
            )}
            <span className="ml-auto shrink-0 text-right">
              <b className={`tnum block ${r.pnl >= 0n ? "text-pos" : "text-neg"}`}>
                {r.pnl >= 0n ? "+" : ""}
                {fmtPts(r.pnl)} pts
              </b>
              {(key === "net" || key === "summerup") && r.open !== 0n && (
                <span className="tnum block text-xs text-faint">
                  {fmtPts(r.banked)} banked · {fmtPts(r.open)} open
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
