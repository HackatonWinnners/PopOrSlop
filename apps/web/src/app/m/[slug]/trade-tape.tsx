"use client";

import { fmtPts, fmtShares, fmtTime } from "~/lib/format";
import { trpc } from "~/lib/trpc";

/** Public pseudonymous tape — sunlight over moderation (spec §8). */
export function TradeTape({ marketId, outcomes }: { marketId: string; outcomes: string[] }) {
  const tape = trpc.market.tape.useQuery({ marketId }, { refetchInterval: 2000 });
  if (!tape.data?.length) return null;

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-zinc-400">Trade tape</h2>
      <ul className="divide-y divide-zinc-800/60 text-sm">
        {tape.data.map((t) => (
          <li key={String(t.id)} className="flex items-center gap-2 py-1.5">
            <span className="text-zinc-500">{fmtTime(t.ts)}</span>
            <span className="font-medium">@{t.handle}</span>
            {t.team && <span className="rounded bg-zinc-800 px-1 text-xs text-zinc-400">{t.team}</span>}
            {t.selfFlagged && (
              <span
                className="rounded bg-amber-950 px-1 text-xs text-amber-400"
                title="self-declared insider"
              >
                insider
              </span>
            )}
            <span className={t.deltaShares > 0n ? "text-emerald-400" : "text-red-400"}>
              {t.deltaShares > 0n ? "bought" : "sold"} {fmtShares(t.deltaShares < 0n ? -t.deltaShares : t.deltaShares)}
            </span>
            <span className="truncate text-zinc-400">{outcomes[t.outcomeIdx]}</span>
            <span className="ml-auto font-mono text-zinc-500">
              {fmtPts(t.cost < 0n ? -t.cost : t.cost)} pts
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
