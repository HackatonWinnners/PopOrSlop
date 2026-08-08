"use client";

import { useState } from "react";
import { trpc } from "~/lib/trpc";

const TYPES = [
  "EVENT_DEMO",
  "COHORT_INDEX",
  "SURVIVAL",
  "REG_EVENT",
  "EXIT",
  "FUNDING_BINARY",
  "FUNDING_BUCKET",
  "INVESTOR_IN",
  "MILESTONE_PUBLIC",
] as const;

export function CreateMarketForm({ onDone }: { onDone: () => void }) {
  const utils = trpc.useUtils();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]>("EVENT_DEMO");
  const [outcomesRaw, setOutcomesRaw] = useState("YES\nNO");
  const [criteria, setCriteria] = useState("");
  const [bPoints, setBPoints] = useState<100 | 250 | 1000>(250);
  const [closeAt, setCloseAt] = useState("");
  const [priorsRaw, setPriorsRaw] = useState("");
  const [capPoints, setCapPoints] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);

  const create = trpc.admin.createMarket.useMutation({
    onSuccess: () => {
      void utils.market.invalidate();
      onDone();
    },
    onError: (e) => setError(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const outcomes = outcomesRaw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const priors = priorsRaw.trim()
      ? priorsRaw.split(/[\s,]+/).map(Number).filter((n) => n > 0)
      : undefined;
    create.mutate({
      title,
      slug: slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      type,
      outcomes,
      criteriaMd: criteria,
      bPoints,
      closeAt: new Date(closeAt),
      priors,
      positionCapPoints: capPoints === "" ? undefined : capPoints,
    });
  };

  const input = "mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm";
  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-sm">
        <span className="text-zinc-400">Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} required className={input} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-zinc-400">Slug (auto if empty)</span>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} className={input} />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-400">Type</span>
          <select value={type} onChange={(e) => setType(e.target.value as never)} className={input}>
            {TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-zinc-400">Outcomes (one per line)</span>
        <textarea
          value={outcomesRaw}
          onChange={(e) => setOutcomesRaw(e.target.value)}
          rows={4}
          required
          className={input}
        />
      </label>
      <label className="block text-sm">
        <span className="text-zinc-400">Resolution criteria (frozen + hashed at listing)</span>
        <textarea
          value={criteria}
          onChange={(e) => setCriteria(e.target.value)}
          rows={4}
          required
          minLength={10}
          className={input}
        />
      </label>
      <div className="grid grid-cols-3 gap-3">
        <label className="block text-sm">
          <span className="text-zinc-400">b (liquidity)</span>
          <select
            value={bPoints}
            onChange={(e) => setBPoints(Number(e.target.value) as never)}
            className={input}
          >
            <option value={100}>100 — long tail</option>
            <option value={250}>250 — standard</option>
            <option value={1000}>1000 — flagship</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-zinc-400">Closes at</span>
          <input
            type="datetime-local"
            value={closeAt}
            onChange={(e) => setCloseAt(e.target.value)}
            required
            className={input}
          />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-400">Position cap (pts, empty = none)</span>
          <input
            type="number"
            value={capPoints}
            onChange={(e) => setCapPoints(e.target.value === "" ? "" : Number(e.target.value))}
            className={input}
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-zinc-400">Priors (optional, space-separated, normalized — else uniform)</span>
        <input
          value={priorsRaw}
          onChange={(e) => setPriorsRaw(e.target.value)}
          placeholder="0.45 0.55"
          className={input}
        />
      </label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        disabled={create.isPending}
        className="rounded bg-emerald-500 px-4 py-2 font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
      >
        {create.isPending ? "…" : "List market"}
      </button>
    </form>
  );
}
