"use client";

import { use, useState } from "react";
import { Tag } from "~/components/ui";
import { fmtProb } from "~/lib/format";
import { trpc } from "~/lib/trpc";
import { DisputeBanner } from "./dispute-banner";
import { EvidenceTab } from "./evidence-tab";
import { PriceChart } from "./price-chart";
import { TradePanel } from "./trade-panel";
import { TradeTape } from "./trade-tape";

export default function MarketPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const market = trpc.market.bySlug.useQuery({ slug }, { refetchInterval: 2000 });
  const [selected, setSelected] = useState(0);
  const [tab, setTab] = useState<"trade" | "criteria" | "evidence">("trade");

  if (market.isLoading) return <p className="py-8 text-faint">Loading…</p>;
  if (!market.data) return <p className="py-8 text-faint">Market not found.</p>;
  const m = market.data;

  return (
    <div className="space-y-4">
      <header className="pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <Tag>{m.type}</Tag>
          <span className="label" title="insider exposure">
            I{m.iClass}
          </span>
          <span className="label" title="oracle manipulability">
            M{m.mClass}
          </span>
          {m.mClass === 2 && <Tag tone="warn">manipulable — for fun</Tag>}
          <span className="label ml-auto">
            {m.status === "OPEN" ? `closes ${new Date(m.closeAt).toLocaleString()}` : m.status}
          </span>
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{m.title}</h1>
      </header>

      <DisputeBanner market={m} />

      {/* Outcome grid — tap to select for trading */}
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {m.outcomes.map((o, i) => (
          <button
            key={i}
            onClick={() => setSelected(i)}
            className={`flex items-center justify-between rounded-[var(--radius-control)] border px-3 py-2 text-left text-sm ${
              selected === i
                ? "border-accent bg-accent-soft"
                : "border-line bg-surface hover:border-line-strong"
            } ${m.resolvedOutcome === i ? "ring-1 ring-accent" : ""}`}
          >
            <span className="truncate">{o}</span>
            <b className="tnum ml-2 shrink-0 text-accent">
              {m.pricesMicro ? fmtProb(m.pricesMicro[i], 1) : "—"}
            </b>
          </button>
        ))}
      </div>

      <PriceChart marketId={m.id} outcomes={m.outcomes} />

      <div className="flex gap-4 border-b border-line text-sm">
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
            className={`pb-2 ${tab === key ? "border-b-2 border-accent font-semibold" : "text-faint"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "trade" &&
        (m.status === "OPEN" ? (
          <TradePanel market={m} outcomeIdx={selected} />
        ) : (
          <p className="text-sm text-faint">Trading closed ({m.status}).</p>
        ))}
      {tab === "criteria" && (
        <div className="space-y-2">
          <pre className="whitespace-pre-wrap rounded border border-line bg-surface p-3 text-sm text-ink-2">
            {m.criteriaMd}
          </pre>
          <p className="font-mono text-xs text-faint">
            frozen at listing — sha256 {m.criteriaHash.slice(0, 16)}…
          </p>
        </div>
      )}
      {tab === "evidence" && <EvidenceTab marketId={m.id} outcomes={m.outcomes} />}

      <TradeTape marketId={m.id} outcomes={m.outcomes} />
    </div>
  );
}
