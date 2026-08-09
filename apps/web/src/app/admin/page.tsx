"use client";

import { useState } from "react";
import { trpc } from "~/lib/trpc";
import { CreateMarketForm } from "./create-market";
import { ImportTeams } from "./import-teams";
import { Disputes } from "./disputes";
import { DraftProposals } from "./draft-proposals";
import { MarketRow } from "./market-row";
import { OracleEvents } from "./oracle-events";
import { QuestsAdmin } from "./quests";

export default function AdminPage() {
  const me = trpc.me.useQuery();
  const markets = trpc.market.list.useQuery(undefined, { refetchInterval: 5000 });
  const invariants = trpc.admin.invariants.useQuery(undefined, {
    refetchInterval: 15_000,
    retry: false,
    enabled: !!me.data?.isAdmin,
  });
  const [tab, setTab] = useState<
    "markets" | "create" | "import" | "oracle" | "disputes" | "quests"
  >("markets");

  if (me.data === null) return <p className="py-8 text-zinc-500">Not signed in.</p>;
  if (me.data && !me.data.isAdmin) return <p className="py-8 text-zinc-500">Admins only.</p>;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between py-2">
        <h1 className="text-xl font-bold">Admin console</h1>
        {invariants.data && (
          <span
            className={`rounded px-2 py-1 text-xs font-semibold ${
              invariants.data.length === 0
                ? "bg-emerald-950 text-emerald-400"
                : "bg-red-950 text-red-400"
            }`}
            title={invariants.data.map((v) => `${v.invariant}: ${v.detail}`).join("\n")}
          >
            {invariants.data.length === 0
              ? "✓ ledger invariants hold"
              : `✗ ${invariants.data.length} invariant violation(s)`}
          </span>
        )}
      </header>

      <div className="flex gap-4 border-b border-zinc-800 text-sm">
        {(
          [
            ["markets", "Markets"],
            ["create", "Create market"],
            ["import", "Team import"],
            ["oracle", "Oracle events"],
            ["disputes", "Disputes"],
            ["quests", "Quests"],
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

      {tab === "create" && <CreateMarketForm onDone={() => setTab("markets")} />}
      {tab === "import" && <ImportTeams onDone={() => setTab("markets")} />}
      {tab === "oracle" && <OracleEvents />}
      {tab === "disputes" && <Disputes />}
      {tab === "quests" && <QuestsAdmin />}
      {tab === "markets" && (
        <div className="space-y-2">
          <DraftProposals />
          {(markets.data ?? []).map((m) => (
            <MarketRow key={m.id} market={m} />
          ))}
        </div>
      )}
    </div>
  );
}
