"use client";

import { use, useState } from "react";
import { fmtProb } from "~/lib/format";
import { trpc } from "~/lib/trpc";
import { EvidenceTab } from "./evidence-tab";
import { PriceChart } from "./price-chart";
import { TradePanel } from "./trade-panel";
import { TradeTape } from "./trade-tape";

export default function MarketPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const market = trpc.market.bySlug.useQuery({ slug }, { refetchInterval: 2000 });
  const [selected, setSelected] = useState(0);
  const [tab, setTab] = useState<"trade" | "criteria" | "evidence">("trade");

  if (market.isLoading) return <p className="py-8 text-zinc-500">Loading…</p>;
  if (!market.data) return <p className="py-8 text-zinc-500">Market not found.</p>;
  const m = market.data;

  return (
    <div className="space-y-4">
      <header>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span className="rounded bg-zinc-800 px-1.5 py-0.5">{m.type}</span>
          <span>I{m.iClass}</span>
          <span>M{m.mClass}</span>
          {m.mClass === 2 && (
            <span className="rounded bg-amber-950 px-1.5 py-0.5 text-amber-400">
              manipulable — for fun
            </span>
          )}
          <span className="ml-auto">
            {m.status === "OPEN" ? `closes ${new Date(m.closeAt).toLocaleString()}` : m.status}
          </span>
        </div>
        <h1 className="mt-1 text-lg font-bold">{m.title}</h1>
      </header>

      {/* Outcome grid — tap to select for trading */}
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {m.outcomes.map((o, i) => (
          <button
            key={i}
            onClick={() => setSelected(i)}
            className={`flex items-center justify-between rounded border px-3 py-2 text-left text-sm ${
              selected === i
                ? "border-emerald-500 bg-emerald-950/40"
                : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-600"
            } ${m.resolvedOutcome === i ? "ring-1 ring-emerald-400" : ""}`}
          >
            <span className="truncate">{o}</span>
            <b className="ml-2 shrink-0 text-emerald-300">
              {m.pricesMicro ? fmtProb(m.pricesMicro[i], 1) : "—"}
            </b>
          </button>
        ))}
      </div>

      <PriceChart marketId={m.id} outcomes={m.outcomes} />

      <div className="flex gap-4 border-b border-zinc-800 text-sm">
        {(
          [
            ["trade", "Trade"],
            ["criteria", "Resolution criteria"],
            ["evidence", "Evidence"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`pb-2 ${tab === key ? "border-b-2 border-emerald-400 font-semibold" : "text-zinc-500"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "trade" &&
        (m.status === "OPEN" ? (
          <TradePanel market={m} outcomeIdx={selected} />
        ) : (
          <p className="text-sm text-zinc-500">Trading closed ({m.status}).</p>
        ))}
      {tab === "criteria" && (
        <div className="space-y-2">
          <pre className="whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-900/50 p-3 text-sm text-zinc-300">
            {m.criteriaMd}
          </pre>
          <p className="font-mono text-xs text-zinc-600">
            frozen at listing — sha256 {m.criteriaHash.slice(0, 16)}…
          </p>
        </div>
      )}
      {tab === "evidence" && <EvidenceTab marketId={m.id} outcomes={m.outcomes} />}

      <TradeTape marketId={m.id} outcomes={m.outcomes} />
    </div>
  );
}
