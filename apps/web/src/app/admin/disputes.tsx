"use client";

import { useState } from "react";
import { fmtPts, fmtTime } from "~/lib/format";
import { trpc } from "~/lib/trpc";

/** Council screen (v1 council = founder + 2 trusted users, spec §7). */
export function Disputes() {
  const utils = trpc.useUtils();
  const disputes = trpc.admin.disputes.useQuery(undefined, { refetchInterval: 15_000 });
  const markets = trpc.market.list.useQuery();
  const [correctedIdx, setCorrectedIdx] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const resolve = trpc.admin.resolveDispute.useMutation({
    onSuccess: () => {
      void utils.admin.invalidate();
      void utils.market.invalidate();
    },
    onError: (e) => setError(e.message),
  });

  const marketById = new Map((markets.data ?? []).map((m) => [m.id, m]));

  if (!disputes.data?.length) {
    return <p className="py-6 text-sm text-faint">No disputes filed.</p>;
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-neg">{error}</p>}
      {disputes.data.map((d) => {
        const market = marketById.get(d.marketId);
        return (
          <div key={d.id} className="rounded border border-line bg-surface p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded px-1.5 py-0.5 text-xs ${
                  d.status === "open"
                    ? "bg-warn-bg text-warn"
                    : d.status === "overturned"
                      ? "bg-accent-soft text-accent"
                      : "bg-surface-2 text-muted"
                }`}
              >
                {d.status}
              </span>
              <span className="font-semibold">{market?.title ?? d.marketId}</span>
              <span className="ml-auto text-xs text-faint">
                staked {fmtPts(d.stake, 0)} pts · {fmtTime(d.createdAt)}
              </span>
            </div>
            <p className="mt-1 text-ink-2">“{d.reason}”</p>
            {market && market.resolvedOutcome !== null && (
              <p className="mt-1 text-xs text-faint">
                proposed outcome: <b>{market.outcomes[market.resolvedOutcome]}</b>
              </p>
            )}
            {d.status === "open" && market && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => resolve.mutate({ disputeId: d.id, upheld: true })}
                  disabled={resolve.isPending}
                  className="rounded bg-surface-3 px-2 py-1 text-xs font-semibold"
                >
                  Uphold original (slash stake)
                </button>
                <span className="text-xs text-faint">or overturn to</span>
                <select
                  value={correctedIdx[d.id] ?? ""}
                  onChange={(e) => setCorrectedIdx({ ...correctedIdx, [d.id]: Number(e.target.value) })}
                  className="rounded border border-line-strong bg-surface px-2 py-1 text-xs"
                >
                  <option value="" disabled>
                    corrected outcome…
                  </option>
                  {market.outcomes.map((o, i) => (
                    <option key={i} value={i}>
                      {o}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() =>
                    resolve.mutate({
                      disputeId: d.id,
                      upheld: false,
                      correctedOutcomeIdx: correctedIdx[d.id],
                    })
                  }
                  disabled={resolve.isPending || correctedIdx[d.id] === undefined}
                  className="rounded bg-accent px-2 py-1 text-xs font-semibold disabled:opacity-50"
                >
                  Overturn (return stake + bounty)
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
