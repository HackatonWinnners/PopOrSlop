"use client";

import { useMemo, useState } from "react";
import { inputClass } from "~/components/ui";
import { fmtProb } from "~/lib/format";

/**
 * Outcome selector. A binary reads best in listing order; a 114-team field
 * doesn't read at all that way, so past a threshold it ranks by price and
 * gains a filter box. The selected outcome is always pinned into view, or you
 * could type a filter and lose sight of what you're about to buy.
 */
const RANK_FROM = 8;
const COLLAPSE_TO = 12;

export function OutcomePicker({
  outcomes,
  pricesMicro,
  selected,
  onSelect,
  resolvedOutcome,
}: {
  outcomes: string[];
  pricesMicro: number[] | null;
  selected: number;
  onSelect: (i: number) => void;
  resolvedOutcome: number | null;
}) {
  const many = outcomes.length > RANK_FROM;
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);

  const rows = useMemo(() => {
    const all = outcomes.map((o, i) => ({ o, i, p: pricesMicro?.[i] ?? null }));
    if (!many) return all;
    return all.sort((a, b) => (b.p ?? 0) - (a.p ?? 0));
  }, [outcomes, pricesMicro, many]);

  const q = query.trim().toLowerCase();
  const matched = q ? rows.filter((r) => r.o.toLowerCase().includes(q)) : rows;
  const truncated = many && !q && !expanded && matched.length > COLLAPSE_TO;
  const shown = truncated ? matched.slice(0, COLLAPSE_TO) : matched;
  // Never hide what's currently selected.
  const visible = shown.some((r) => r.i === selected)
    ? shown
    : [...shown, rows.find((r) => r.i === selected)!].filter(Boolean);

  return (
    <div className="space-y-2">
      {many && (
        <div className="flex items-center gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Filter ${outcomes.length} outcomes…`}
            className={`${inputClass} py-1.5 text-sm`}
          />
          <span className="label shrink-0 text-faint">ranked by price</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {visible.map((r) => (
          <button
            key={r.i}
            onClick={() => onSelect(r.i)}
            className={`flex items-center justify-between rounded-[var(--radius-control)] border px-3 py-2 text-left text-sm ${
              selected === r.i
                ? "border-accent bg-accent-soft"
                : "border-line bg-surface hover:border-line-strong"
            } ${resolvedOutcome === r.i ? "ring-1 ring-accent" : ""}`}
          >
            <span className="truncate">{r.o}</span>
            <b className="tnum ml-2 shrink-0 text-accent">
              {r.p !== null ? fmtProb(r.p, 1) : "—"}
            </b>
          </button>
        ))}
      </div>

      {q && matched.length === 0 && (
        <p className="text-sm text-faint">No outcome matches “{query}”.</p>
      )}
      {truncated && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-sm font-semibold text-accent underline underline-offset-2"
        >
          Show all {outcomes.length} outcomes
        </button>
      )}
    </div>
  );
}
