"use client";

import { useState } from "react";
import { trpc } from "~/lib/trpc";

/**
 * List a startup: the real-money payment is invoiced OFF-platform; entering
 * it here only sets the token launch price (bigger payment → higher price)
 * and mints the startup's allocation.
 */
export function StartupsAdmin() {
  const utils = trpc.useUtils();
  const unlisted = trpc.startup.unlisted.useQuery();
  const [companyId, setCompanyId] = useState("");
  const [paymentUsd, setPaymentUsd] = useState(5000);
  const [logoUrl, setLogoUrl] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = trpc.startup.listStartup.useMutation({
    onSuccess: (r) => {
      setResult(
        `listed — launch price ${Number(r.p0) / 1e6} pts/token, allocation ${Number(r.allocation) / 1e6} tokens (pool subsidy ${Math.ceil(Number(r.allocSubsidy) / 1e6)} pts)`,
      );
      void utils.startup.invalidate();
    },
    onError: (e) => setError(e.message),
  });

  const input = "mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setResult(null);
        list.mutate({
          companyId,
          paymentUsd,
          logoUrl: logoUrl || undefined,
          description: description || undefined,
          links: website ? { website } : undefined,
        });
      }}
      className="max-w-xl space-y-3"
    >
      <label className="block text-sm">
        <span className="text-zinc-400">Startup</span>
        <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} required className={input}>
          <option value="" disabled>
            pick an unlisted company…
          </option>
          {unlisted.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-zinc-400">
          Listing payment (USD, received off-platform — sets launch price: $1k → 1 pt/token)
        </span>
        <input
          type="number"
          min={0}
          value={paymentUsd}
          onChange={(e) => setPaymentUsd(Number(e.target.value))}
          className={input}
        />
      </label>
      <p className="text-xs text-zinc-500">
        Launch price will be {Math.max(1, paymentUsd / 1000).toFixed(1)} pts/token; startup receives
        500 tokens.
      </p>
      <label className="block text-sm">
        <span className="text-zinc-400">Logo URL (optional)</span>
        <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" className={input} />
      </label>
      <label className="block text-sm">
        <span className="text-zinc-400">Website (optional)</span>
        <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" className={input} />
      </label>
      <label className="block text-sm">
        <span className="text-zinc-400">Description (optional)</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={input} />
      </label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {result && <p className="text-sm text-emerald-400">{result}</p>}
      <button
        disabled={list.isPending || !companyId}
        className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
      >
        {list.isPending ? "…" : "List startup & launch token"}
      </button>
    </form>
  );
}
