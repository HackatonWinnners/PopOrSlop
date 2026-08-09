"use client";

import { useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtPts } from "~/lib/format";
import { trpc } from "~/lib/trpc";

/** Bonding-curve token: live price, chart, buy/sell in points. */
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
    <section className="rounded-lg border border-emerald-900 bg-zinc-900/50 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-zinc-400">Token price</p>
        <p className="font-mono text-2xl text-emerald-300">{fmtPts(token.priceMicro)} pts</p>
      </div>
      <p className="text-xs text-zinc-600">
        bonding curve — price rises as supply grows · {fmtPts(token.supply, 0)} tokens outstanding
      </p>

      {chartData.length > 1 && (
        <div className="mt-3 h-32 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <XAxis dataKey="t" tick={{ fontSize: 10, fill: "#71717a" }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: "#71717a" }} width={44} domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 12 }}
                formatter={(v: number) => `${v.toFixed(2)} pts`}
              />
              <Line dataKey="price" stroke="#34d399" dot={false} strokeWidth={2} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {me.data ? (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-400">
              You hold:{" "}
              <b className="text-zinc-200">{fmtPts(myPos.data?.tokens ?? 0n)} tokens</b>
            </p>
            <div className="flex overflow-hidden rounded border border-zinc-700 text-sm">
              <button
                onClick={() => setSide("buy")}
                className={`px-3 py-1 ${side === "buy" ? "bg-emerald-500 font-semibold text-zinc-950" : ""}`}
              >
                Buy
              </button>
              <button
                onClick={() => setSide("sell")}
                className={`px-3 py-1 ${side === "sell" ? "bg-red-500 font-semibold text-zinc-950" : ""}`}
              >
                Sell
              </button>
            </div>
          </div>

          {side === "buy" ? (
            <div className="flex items-center gap-2 text-sm">
              <input
                type="number"
                min={1}
                value={budgetPts}
                onChange={(e) => setBudgetPts(Number(e.target.value))}
                className="w-24 rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
              />
              <span className="text-zinc-500">pts →</span>
              <span className="text-zinc-300">
                {quote.data ? `≈ ${fmtPts(quote.data.deltaTokens)} tokens` : "…"}
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
                className="w-24 rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
              />
              <span className="text-zinc-500">tokens →</span>
              <span className="text-zinc-300">
                {quote.data ? `receive ≈ ${fmtPts(-quote.data.cost)} pts` : "…"}
              </span>
              {myPos.data && myPos.data.tokens > 0n && (
                <button
                  onClick={() => setSellTokens(Number(myPos.data!.tokens / 1000n) / 1000)}
                  className="rounded bg-zinc-800 px-2 py-0.5 text-xs"
                >
                  all
                </button>
              )}
            </div>
          )}

          <button
            onClick={submit}
            disabled={trade.isPending}
            className={`w-full rounded py-2 font-semibold text-zinc-950 disabled:opacity-50 ${
              side === "buy" ? "bg-emerald-500 hover:bg-emerald-400" : "bg-red-500 hover:bg-red-400"
            }`}
          >
            {trade.isPending ? "…" : side === "buy" ? "Buy tokens" : "Sell tokens"}
          </button>
          {message && (
            <p className={`text-sm ${message.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>
              {message.text}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-zinc-400">
          <a href="/join" className="text-emerald-400 underline">
            Join
          </a>{" "}
          to trade this token — 1,000 free points.
        </p>
      )}
    </section>
  );
}
