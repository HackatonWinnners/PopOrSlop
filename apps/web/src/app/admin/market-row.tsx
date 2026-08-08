"use client";

import { useState } from "react";
import { fmtProb } from "~/lib/format";
import { trpc } from "~/lib/trpc";

type MarketSummary = {
  id: string;
  slug: string;
  title: string;
  status: string;
  outcomes: string[];
  pricesMicro: number[] | null;
  resolvedOutcome: number | null;
};

export function MarketRow({ market }: { market: MarketSummary }) {
  const utils = trpc.useUtils();
  const [confirmOutcome, setConfirmOutcome] = useState<number | null>(null);
  const [withWindow, setWithWindow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onSettled = () => {
    void utils.market.invalidate();
    void utils.admin.invalidate();
  };
  const lock = trpc.admin.lockMarket.useMutation({ onSuccess: onSettled, onError: (e) => setError(e.message) });
  const resolve = trpc.admin.resolveNow.useMutation({
    onSuccess: () => {
      setConfirmOutcome(null);
      onSettled();
    },
    onError: (e) => setError(e.message),
  });
  const propose = trpc.admin.postResolution.useMutation({
    onSuccess: () => {
      setConfirmOutcome(null);
      onSettled();
    },
    onError: (e) => setError(e.message),
  });
  const na = trpc.admin.naRefund.useMutation({ onSuccess: onSettled, onError: (e) => setError(e.message) });

  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/50 p-3 text-sm">
      <div className="flex items-center gap-2">
        <a href={`/m/${market.slug}`} className="font-semibold hover:underline">
          {market.title}
        </a>
        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs">{market.status}</span>
        <div className="ml-auto flex gap-2">
          {market.status === "OPEN" && (
            <button
              onClick={() => lock.mutate({ marketId: market.id })}
              className="rounded bg-zinc-700 px-2 py-1 text-xs hover:bg-zinc-600"
            >
              Lock now
            </button>
          )}
          {(market.status === "OPEN" || market.status === "LOCKED") && (
            <button
              onClick={() => na.mutate({ marketId: market.id })}
              className="rounded bg-zinc-800 px-2 py-1 text-xs text-amber-400 hover:bg-zinc-700"
            >
              N/A refund
            </button>
          )}
        </div>
      </div>

      {market.status === "LOCKED" && (
        <div className="mt-2">
          <div className="mb-1 flex items-center gap-3 text-xs text-zinc-500">
            <span>Resolve to:</span>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={withWindow}
                onChange={(e) => setWithWindow(e.target.checked)}
              />
              open 48h dispute window (v1 mode; unchecked = instant stage payout)
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {market.outcomes.map((o, i) =>
              confirmOutcome === i ? (
                <span key={i} className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      const args = {
                        marketId: market.id,
                        outcomeIdx: i,
                        evidence: [
                          {
                            source: "manual",
                            summary: withWindow
                              ? `Proposed by admin: ${o} (48h dispute window)`
                              : `Resolved on stage by admin: ${o}`,
                          },
                        ],
                      };
                      if (withWindow) propose.mutate({ ...args, disputeWindowHours: 48 });
                      else resolve.mutate(args);
                    }}
                    disabled={resolve.isPending || propose.isPending}
                    className="rounded bg-emerald-500 px-2 py-1 text-xs font-bold text-zinc-950"
                  >
                    Confirm “{o}” ✓
                  </button>
                  <button
                    onClick={() => setConfirmOutcome(null)}
                    className="rounded bg-zinc-700 px-2 py-1 text-xs"
                  >
                    ✕
                  </button>
                </span>
              ) : (
                <button
                  key={i}
                  onClick={() => setConfirmOutcome(i)}
                  className="rounded bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700"
                >
                  {o}{" "}
                  {market.pricesMicro ? (
                    <span className="text-emerald-300">{fmtProb(market.pricesMicro[i], 0)}</span>
                  ) : null}
                </button>
              ),
            )}
          </div>
        </div>
      )}
      {market.status === "RESOLVED" && market.resolvedOutcome !== null && (
        <p className="mt-1 text-xs text-zinc-500">→ {market.outcomes[market.resolvedOutcome]}</p>
      )}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
