"use client";

import { useState } from "react";
import { trpc } from "~/lib/trpc";

/**
 * The <30s flow (spec §12.1): paste the team list the moment it's published,
 * hit one button, flagship winner market is live.
 */
export function ImportTeams({ onDone }: { onDone: () => void }) {
  const utils = trpc.useUtils();
  const [title, setTitle] = useState("Which team wins SummerUp?");
  const [slug, setSlug] = useState("summerup-winner");
  const [teamsRaw, setTeamsRaw] = useState("");
  const [closeAt, setCloseAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  const importMut = trpc.admin.importTeamsMarket.useMutation({
    onSuccess: () => {
      void utils.market.invalidate();
      onDone();
    },
    onError: (e) => setError(e.message),
  });

  const teams = teamsRaw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const input = "mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        importMut.mutate({ title, slug, teamsRaw, closeAt: new Date(closeAt) });
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-zinc-400">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required className={input} />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-400">Slug</span>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} required className={input} />
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-zinc-400">
          Teams — paste CSV or one per line ({teams.length} parsed)
        </span>
        <textarea
          value={teamsRaw}
          onChange={(e) => setTeamsRaw(e.target.value)}
          rows={8}
          required
          placeholder={"Team Rocket\nNullPointerException\nSchrödinbug"}
          className={input}
        />
      </label>
      <label className="block text-sm">
        <span className="text-zinc-400">Trading closes at (judging start)</span>
        <input
          type="datetime-local"
          value={closeAt}
          onChange={(e) => setCloseAt(e.target.value)}
          required
          className={input}
        />
      </label>
      <p className="text-xs text-zinc-500">
        Creates a flagship categorical market: b = 1000, uniform prior, 300-pt position cap.
      </p>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        disabled={importMut.isPending || teams.length < 2}
        className="rounded bg-emerald-500 px-4 py-2 font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
      >
        {importMut.isPending ? "…" : `List winner market (${teams.length} teams)`}
      </button>
    </form>
  );
}
