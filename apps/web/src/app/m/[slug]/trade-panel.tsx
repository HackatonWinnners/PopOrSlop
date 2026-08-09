"use client";

import { useState } from "react";
import { fmtPts, fmtShares } from "~/lib/format";
import { trpc } from "~/lib/trpc";

const QUICK_BUDGETS = [10, 50, 100, 250];
/** Buys tolerate 2% adverse move between quote and execution. */
const SLIPPAGE_NUM = 102n;
const SLIPPAGE_DEN = 100n;

export function TradePanel({
  market,
  outcomeIdx,
}: {
  market: { id: string; outcomes: string[]; positionCap: bigint | null };
  outcomeIdx: number;
}) {
  const utils = trpc.useUtils();
  const me = trpc.me.useQuery();
  const [budgetPts, setBudgetPts] = useState<number>(50);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [sellShares, setSellShares] = useState<number>(0);
  const [selfFlagged, setSelfFlagged] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const budgetMicro = BigInt(Math.max(0, Math.round(budgetPts * 1e6)));
  const sellMicro = BigInt(Math.max(0, Math.round(sellShares * 1e6)));

  // bigint inputs go over as strings: react-query hashes queryKeys with
  // plain JSON.stringify, which cannot serialize BigInt.
  const quote = trpc.trade.quote.useQuery(
    side === "buy"
      ? { marketId: market.id, outcomeIdx, budget: budgetMicro.toString() }
      : { marketId: market.id, outcomeIdx, deltaShares: (-sellMicro).toString() },
    {
      enabled: side === "buy" ? budgetMicro > 0n : sellMicro > 0n,
      refetchInterval: 2500,
    },
  );

  const mine = trpc.portfolio.mine.useQuery(undefined, { enabled: !!me.data });
  const held = mine.data?.positions.find(
    (p) => p.marketId === market.id && p.outcomeIdx === outcomeIdx,
  )?.shares;

  const execute = trpc.trade.execute.useMutation({
    onSuccess: (res) => {
      setMessage({
        kind: "ok",
        text:
          res.deltaShares > 0n
            ? `Bought ${fmtShares(res.deltaShares)} shares for ${fmtPts(res.cost)} pts`
            : `Sold ${fmtShares(-res.deltaShares)} shares for ${fmtPts(-res.cost)} pts`,
      });
      void utils.market.invalidate();
      void utils.portfolio.invalidate();
      void utils.me.invalidate();
    },
    onError: (e) => setMessage({ kind: "err", text: e.message }),
  });

  if (!me.data) {
    return (
      <p className="rounded border border-line p-4 text-sm text-muted">
        <a href="/join" className="text-accent underline">
          Join
        </a>{" "}
        to trade — 1,000 free points.
      </p>
    );
  }

  const submit = () => {
    setMessage(null);
    if (side === "buy") {
      execute.mutate({
        marketId: market.id,
        outcomeIdx,
        budget: budgetMicro.toString(),
        maxCost: budgetMicro.toString(),
        selfFlagged,
      });
    } else {
      const proceeds = quote.data ? -quote.data.cost : 0n;
      execute.mutate({
        marketId: market.id,
        outcomeIdx,
        deltaShares: (-sellMicro).toString(),
        // Sells tolerate 2% less proceeds than quoted.
        maxCost: (-((proceeds * SLIPPAGE_DEN) / SLIPPAGE_NUM)).toString(),
        selfFlagged,
      });
    }
  };

  return (
    <div className="space-y-3 rounded border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm">
          <span className="text-muted">Trading:</span>{" "}
          <b>{market.outcomes[outcomeIdx]}</b>
        </p>
        <div className="flex overflow-hidden rounded border border-line-strong text-sm">
          <button
            onClick={() => setSide("buy")}
            className={`px-3 py-1 ${side === "buy" ? "bg-accent font-semibold text-accent-ink" : ""}`}
          >
            Buy
          </button>
          <button
            onClick={() => setSide("sell")}
            className={`px-3 py-1 ${side === "sell" ? "bg-neg font-semibold text-accent-ink" : ""}`}
          >
            Sell
          </button>
        </div>
      </div>

      {side === "buy" ? (
        <>
          <div className="flex items-center gap-2">
            {QUICK_BUDGETS.map((b) => (
              <button
                key={b}
                onClick={() => setBudgetPts(b)}
                className={`rounded px-2.5 py-1 text-sm ${
                  budgetPts === b ? "bg-accent font-semibold text-accent-ink" : "bg-surface-2"
                }`}
              >
                {b}
              </button>
            ))}
            <input
              type="number"
              min={1}
              value={budgetPts}
              onChange={(e) => setBudgetPts(Number(e.target.value))}
              className="w-24 rounded border border-line-strong bg-surface px-2 py-1 text-sm"
            />
            <span className="text-sm text-faint">pts</span>
          </div>
          <p className="text-sm text-muted">
            {quote.data
              ? `≈ ${fmtShares(quote.data.deltaShares)} shares (pays ${fmtShares(quote.data.deltaShares)} pts if right) for ${fmtPts(quote.data.cost)} pts`
              : "…"}
          </p>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm">
            <input
              type="number"
              min={0}
              step="0.5"
              value={sellShares}
              onChange={(e) => setSellShares(Number(e.target.value))}
              className="w-28 rounded border border-line-strong bg-surface px-2 py-1"
            />
            <span className="text-faint">shares</span>
            {held !== undefined && held > 0n && (
              <button
                onClick={() => setSellShares(Number(held / 1000n) / 1000)}
                className="rounded bg-surface-2 px-2 py-1 text-xs"
              >
                all ({fmtShares(held)})
              </button>
            )}
          </div>
          <p className="text-sm text-muted">
            {quote.data ? `receive ≈ ${fmtPts(-quote.data.cost)} pts` : "…"}
          </p>
        </>
      )}

      <label className="flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={selfFlagged}
          onChange={(e) => setSelfFlagged(e.target.checked)}
        />
        I have inside involvement in this outcome (shows a badge on the tape)
      </label>

      {market.positionCap !== null && (
        <p className="text-xs text-faint">
          Position cap: {fmtPts(market.positionCap, 0)} pts cost basis per trader on this market.
        </p>
      )}

      <button
        onClick={submit}
        disabled={execute.isPending}
        className={`w-full rounded py-2 font-semibold text-accent-ink disabled:opacity-50 ${
          side === "buy" ? "bg-accent hover:opacity-90" : "bg-neg hover:opacity-90"
        }`}
      >
        {execute.isPending ? "…" : side === "buy" ? "Buy" : "Sell"}
      </button>

      {message && (
        <p className={`text-sm ${message.kind === "ok" ? "text-pos" : "text-neg"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
