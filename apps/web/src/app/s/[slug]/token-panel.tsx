"use client";

import { useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button, Card, inputClass } from "~/components/ui";
import { fmtPts } from "~/lib/format";
import { trpc } from "~/lib/trpc";

/**
 * Bonding-curve token: price + chart on the left, buy/sell docked right
 * (matches the design's split panel; stacks on mobile).
 */
export function TokenPanel({
  companyId,
  token,
}: {
  companyId: string;
  token: { priceMicro: bigint; supply: bigint };
}) {
  const utils = trpc.useUtils();
  const me = trpc.me.useQuery();
  const myPos = trpc.startup.myTokens.useQuery({ companyId }, { enabled: !!me.data });
  const history = trpc.startup.tokenHistory.useQuery({ companyId }, { refetchInterval: 5000 });

  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [budgetPts, setBudgetPts] = useState(50);
  const [sellTokens, setSellTokens] = useState(0);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const budgetMicro = BigInt(Math.max(0, Math.round(budgetPts * 1e6)));
  const sellMicro = BigInt(Math.max(0, Math.round(sellTokens * 1e6)));

  const quote = trpc.startup.tokenQuote.useQuery(
    side === "buy"
      ? { companyId, budget: budgetMicro.toString() }
      : { companyId, deltaTokens: (-sellMicro).toString() },
    { enabled: side === "buy" ? budgetMicro > 0n : sellMicro > 0n, refetchInterval: 4000 },
  );

  const trade = trpc.startup.tokenTrade.useMutation({
    onSuccess: (r) => {
      setMessage({
        kind: "ok",
        text:
          r.deltaTokens > 0n
            ? `Bought ${fmtPts(r.deltaTokens)} tokens for ${fmtPts(r.cost)} pts`
            : `Sold ${fmtPts(-r.deltaTokens)} tokens for ${fmtPts(-r.cost)} pts`,
      });
      void utils.startup.invalidate();
      void utils.me.invalidate();
    },
    onError: (e) => setMessage({ kind: "err", text: e.message }),
  });

  const chartData = (history.data ?? []).map((h) => ({
    t: new Date(h.ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    price: Number(h.priceAfter) / 1e6,
  }));

  const submit = () => {
    setMessage(null);
    if (side === "buy") {
      trade.mutate({ companyId, budget: budgetMicro.toString(), maxCost: budgetMicro.toString() });
    } else {
      const proceeds = quote.data ? -quote.data.cost : 0n;
      trade.mutate({
        companyId,
        deltaTokens: (-sellMicro).toString(),
        maxCost: (-((proceeds * 100n) / 102n)).toString(), // 2% slippage
      });
    }
  };

  return (
    <Card className="grid grid-cols-1 lg:grid-cols-[1fr_320px]">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="label">Token price</p>
            <p className="tnum text-4xl text-accent">
              {fmtPts(token.priceMicro)} <span className="text-base text-faint">pts</span>
            </p>
          </div>
          <div className="text-right">
            <p className="label">Supply outstanding</p>
            <p className="tnum text-lg">{fmtPts(token.supply, 0)}</p>
          </div>
        </div>

        {chartData.length > 1 && (
          <div className="mt-4 h-36 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis
                  dataKey="t"
                  tick={{ fontSize: 10, fill: "var(--faint)" }}
                  interval="preserveStartEnd"
                  stroke="var(--line)"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--faint)" }}
                  width={48}
                  domain={["auto", "auto"]}
                  stroke="var(--line)"
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--line)",
                    borderRadius: "var(--radius)",
                    fontSize: 12,
                    color: "var(--ink)",
                  }}
                  formatter={(v: number) => `${v.toFixed(2)} pts`}
                />
                <Line
                  dataKey="price"
                  stroke="var(--accent)"
                  dot={false}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-3 text-xs text-faint">
          Price rises along a bonding curve as supply grows — every buy mints, every sell burns.
        </p>
      </div>

      <div className="border-t border-line p-5 lg:border-t-0 lg:border-l">
        {me.data ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 overflow-hidden rounded-[var(--radius-control)] border border-line-strong text-sm">
              <button
                onClick={() => setSide("buy")}
                className={`py-1.5 ${side === "buy" ? "bg-accent font-semibold text-accent-ink" : "text-muted"}`}
              >
                Buy
              </button>
              <button
                onClick={() => setSide("sell")}
                className={`py-1.5 ${side === "sell" ? "bg-neg font-semibold text-white" : "text-muted"}`}
              >
                Sell
              </button>
            </div>

            {side === "buy" ? (
              <div className="flex items-center gap-2 text-sm">
                <input
                  type="number"
                  min={1}
                  value={budgetPts}
                  onChange={(e) => setBudgetPts(Number(e.target.value))}
                  className={`${inputClass} w-24`}
                />
                <span className="tnum text-xs text-muted">
                  pts → {quote.data ? `≈ ${fmtPts(quote.data.deltaTokens)} tokens` : "…"}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm">
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={sellTokens}
                  onChange={(e) => setSellTokens(Number(e.target.value))}
                  className={`${inputClass} w-24`}
                />
                <span className="tnum text-xs text-muted">
                  → {quote.data ? `≈ ${fmtPts(-quote.data.cost)} pts` : "…"}
                </span>
                {myPos.data && myPos.data.tokens > 0n && (
                  <button
                    onClick={() => setSellTokens(Number(myPos.data!.tokens / 1000n) / 1000)}
                    className="label rounded-[var(--radius-control)] bg-surface-2 px-2 py-1"
                  >
                    all
                  </button>
                )}
              </div>
            )}

            <p className="text-xs text-faint">
              You hold <b className="tnum text-ink">{fmtPts(myPos.data?.tokens ?? 0n)}</b> tokens
            </p>

            <Button
              onClick={submit}
              disabled={trade.isPending}
              variant={side === "buy" ? "primary" : "danger"}
              className="w-full"
            >
              {trade.isPending ? "…" : side === "buy" ? "Buy tokens" : "Sell tokens"}
            </Button>
            {message && (
              <p className={`text-xs ${message.kind === "ok" ? "text-pos" : "text-neg"}`}>
                {message.text}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">
            <a href="/join" className="text-accent underline">
              Join
            </a>{" "}
            to trade this token — 1,000 free points.
          </p>
        )}
      </div>
    </Card>
  );
}
