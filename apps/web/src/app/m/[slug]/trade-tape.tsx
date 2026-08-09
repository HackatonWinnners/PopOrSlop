"use client";

import { fmtPts, fmtShares, fmtTime } from "~/lib/format";
import { SectionLabel } from "~/components/ui";
import { trpc } from "~/lib/trpc";

/** Public pseudonymous tape — sunlight over moderation (spec §8). */
export function TradeTape({ marketId, outcomes }: { marketId: string; outcomes: string[] }) {
  const tape = trpc.market.tape.useQuery({ marketId }, { refetchInterval: 2000 });
  if (!tape.data?.length) return null;

  return (
    <section>
      <SectionLabel index="04">Trade tape</SectionLabel>
      <ul className="divide-y divide-line text-sm">
        {tape.data.map((t) => (
          <li key={String(t.id)} className="flex items-center gap-2 py-1.5">
            <span className="text-faint">{fmtTime(t.ts)}</span>
            <span className="font-medium">@{t.handle}</span>
            {t.team && <span className="rounded bg-surface-2 px-1 text-xs text-muted">{t.team}</span>}
            {t.selfFlagged && (
              <span
                className="rounded bg-warn-bg px-1 text-xs text-warn"
                title="self-declared insider"
              >
                insider
              </span>
            )}
            <span className={t.deltaShares > 0n ? "text-pos" : "text-neg"}>
              {t.deltaShares > 0n ? "bought" : "sold"} {fmtShares(t.deltaShares < 0n ? -t.deltaShares : t.deltaShares)}
            </span>
            <span className="truncate text-muted">{outcomes[t.outcomeIdx]}</span>
            <span className="ml-auto font-mono text-faint">
              {fmtPts(t.cost < 0n ? -t.cost : t.cost)} pts
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
