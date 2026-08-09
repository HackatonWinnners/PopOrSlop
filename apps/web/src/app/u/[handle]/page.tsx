"use client";

import { use } from "react";
import { fmtProb } from "~/lib/format";
import { SectionLabel } from "~/components/ui";
import { trpc } from "~/lib/trpc";

/** Public calibration profile (spec §6.3). M2 markets excluded from scoring. */
export default function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = use(params);
  const cal = trpc.portfolio.calibration.useQuery({ handle });

  if (cal.isLoading) return <p className="py-8 text-faint">Loading…</p>;
  if (!cal.data) return <p className="py-8 text-faint">No such trader.</p>;
  const c = cal.data;

  return (
    <div className="space-y-4">
      <header className="py-2">
        <h1 className="page-title text-3xl font-bold tracking-tight">@{c.handle}</h1>
        <p className="text-sm text-muted">
          {c.team && <span className="mr-2 rounded bg-surface-2 px-1.5 py-0.5 text-xs">{c.team}</span>}
          forecasting since {new Date(c.since).toLocaleDateString()}
        </p>
      </header>

      <section className="flex gap-4">
        <div className="rounded border border-line bg-surface p-4">
          <p className="text-xs text-faint">Brier score (lower = better; 0.25 = coin flip)</p>
          <p className="mt-1 font-mono text-2xl text-accent">
            {c.brier !== null ? c.brier.toFixed(3) : "—"}
          </p>
        </div>
        <div className="rounded border border-line bg-surface p-4">
          <p className="text-xs text-faint">Scored buys (resolved, non-M2 markets)</p>
          <p className="mt-1 font-mono text-2xl">{c.scoredTrades}</p>
        </div>
      </section>

      <section>
        <SectionLabel index="02">Calibration curve</SectionLabel>
        {c.scoredTrades === 0 ? (
          <p className="text-sm text-faint">
            Nothing scored yet — buys count once their markets resolve.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-faint">
                <th className="py-1 font-normal">entry price</th>
                <th className="font-normal">avg predicted</th>
                <th className="font-normal">actual win rate</th>
                <th className="text-right font-normal">weight (shares)</th>
              </tr>
            </thead>
            <tbody>
              {c.buckets
                .filter((b) => b.weight > 0)
                .map((b) => (
                  <tr key={b.range} className="border-t border-line">
                    <td className="py-1.5">{b.range}</td>
                    <td className="font-mono">{fmtProb((b.avgPredicted ?? 0) * 1_000_000)}</td>
                    <td className="font-mono">{fmtProb((b.actualWinRate ?? 0) * 1_000_000)}</td>
                    <td className="text-right font-mono text-faint">{b.weight.toFixed(0)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
