"use client";

import Link from "next/link";
import { useState } from "react";
import { fmtProb, fmtPts, fmtShares } from "~/lib/format";
import { trpc } from "~/lib/trpc";

/** Referral link (spec §6.2): 250 pts when the invitee places a first trade. */
function ReferralCard() {
  const me = trpc.me.useQuery();
  const [copied, setCopied] = useState(false);
  if (!me.data) return null;
  const link = `${window.location.origin}/join?ref=${me.data.handle}`;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-line bg-surface p-3 text-sm">
      <span className="text-muted">
        Invite a forecaster — <b className="text-accent">+250 pts</b> when they make their
        first trade:
      </span>
      <code className="rounded bg-bg px-2 py-1 text-xs">{link}</code>
      <button
        onClick={() => {
          void navigator.clipboard.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="rounded bg-surface-3 px-2 py-1 text-xs hover:bg-surface-3"
      >
        {copied ? "copied ✓" : "copy"}
      </button>
    </div>
  );
}

export default function PortfolioPage() {
  const mine = trpc.portfolio.mine.useQuery(undefined, { refetchInterval: 5000, retry: false });

  if (mine.isError) {
    return (
      <p className="py-8 text-sm text-muted">
        <Link href="/join" className="text-accent underline">
          Join
        </Link>{" "}
        to see your portfolio.
      </p>
    );
  }
  if (!mine.data) return <p className="py-8 text-faint">Loading…</p>;

  const totalMark = mine.data.positions.reduce((a, p) => a + (p.markValue ?? 0n), 0n);
  const totalBasis = mine.data.positions.reduce((a, p) => a + p.costBasis, 0n);

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between py-2">
        <h1 className="page-title text-3xl font-bold tracking-tight">Portfolio</h1>
        <div className="text-right text-sm">
          <p>
            <span className="text-faint">balance</span>{" "}
            <b className="font-mono text-accent">{fmtPts(mine.data.balance)} pts</b>
          </p>
          <p>
            <span className="text-faint">positions mark</span>{" "}
            <b className="font-mono">{fmtPts(totalMark)} pts</b>{" "}
            <span
              className={`font-mono ${totalMark >= totalBasis ? "text-pos" : "text-neg"}`}
            >
              ({totalMark >= totalBasis ? "+" : ""}
              {fmtPts(totalMark - totalBasis)})
            </span>
          </p>
        </div>
      </header>

      {mine.data.positions.length === 0 && (
        <p className="rounded border border-line p-6 text-center text-sm text-faint">
          No open positions.{" "}
          <Link href="/" className="text-accent underline">
            Find a market
          </Link>
          .
        </p>
      )}

      <ReferralCard />

      <ul className="space-y-2">
        {mine.data.positions.map((p) => {
          const pnl = (p.markValue ?? 0n) - p.costBasis;
          return (
            <li key={`${p.marketId}-${p.outcomeIdx}`}>
              <Link
                href={`/m/${p.slug}`}
                className="block rounded border border-line bg-surface p-3 hover:border-line-strong"
              >
                <p className="text-sm font-semibold">{p.title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">{p.outcome}</span>
                  <span>{fmtShares(p.shares)} shares</span>
                  <span className="text-faint">
                    @ {p.priceMicro !== null ? fmtProb(p.priceMicro) : "—"}
                  </span>
                  <span className="ml-auto font-mono">
                    {fmtPts(p.markValue)} pts{" "}
                    <span className={pnl >= 0n ? "text-pos" : "text-neg"}>
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
