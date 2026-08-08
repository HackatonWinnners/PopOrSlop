"use client";

import Link from "next/link";
import { fmtProb, fmtPts, fmtShares } from "~/lib/format";
import { trpc } from "~/lib/trpc";

export default function PortfolioPage() {
  const mine = trpc.portfolio.mine.useQuery(undefined, { refetchInterval: 5000, retry: false });

  if (mine.isError) {
    return (
      <p className="py-8 text-sm text-zinc-400">
        <Link href="/join" className="text-emerald-400 underline">
          Join
        </Link>{" "}
        to see your portfolio.
      </p>
    );
  }
  if (!mine.data) return <p className="py-8 text-zinc-500">Loading…</p>;

  const totalMark = mine.data.positions.reduce((a, p) => a + (p.markValue ?? 0n), 0n);
  const totalBasis = mine.data.positions.reduce((a, p) => a + p.costBasis, 0n);

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between py-2">
        <h1 className="text-xl font-bold">Portfolio</h1>
        <div className="text-right text-sm">
          <p>
            <span className="text-zinc-500">balance</span>{" "}
            <b className="font-mono text-emerald-300">{fmtPts(mine.data.balance)} pts</b>
          </p>
          <p>
            <span className="text-zinc-500">positions mark</span>{" "}
            <b className="font-mono">{fmtPts(totalMark)} pts</b>{" "}
            <span
              className={`font-mono ${totalMark >= totalBasis ? "text-emerald-400" : "text-red-400"}`}
            >
              ({totalMark >= totalBasis ? "+" : ""}
              {fmtPts(totalMark - totalBasis)})
            </span>
          </p>
        </div>
      </header>

      {mine.data.positions.length === 0 && (
        <p className="rounded border border-zinc-800 p-6 text-center text-sm text-zinc-500">
          No open positions.{" "}
          <Link href="/" className="text-emerald-400 underline">
            Find a market
          </Link>
          .
        </p>
      )}

      <ul className="space-y-2">
        {mine.data.positions.map((p) => {
          const pnl = (p.markValue ?? 0n) - p.costBasis;
          return (
            <li key={`${p.marketId}-${p.outcomeIdx}`}>
              <Link
                href={`/m/${p.slug}`}
                className="block rounded border border-zinc-800 bg-zinc-900/50 p-3 hover:border-zinc-600"
              >
                <p className="text-sm font-semibold">{p.title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs">{p.outcome}</span>
                  <span>{fmtShares(p.shares)} shares</span>
                  <span className="text-zinc-500">
                    @ {p.priceMicro !== null ? fmtProb(p.priceMicro) : "—"}
                  </span>
                  <span className="ml-auto font-mono">
                    {fmtPts(p.markValue)} pts{" "}
                    <span className={pnl >= 0n ? "text-emerald-400" : "text-red-400"}>
                      ({pnl >= 0n ? "+" : ""}
                      {fmtPts(pnl)})
                    </span>
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
