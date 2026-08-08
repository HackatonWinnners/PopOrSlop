"use client";

import { fmtTime } from "~/lib/format";
import { trpc } from "~/lib/trpc";

interface EvidenceItem {
  source: string;
  externalRef?: string;
  url?: string;
  archivedUrl?: string;
  fetchedAt?: string;
  sha256?: string;
  summary: string;
}

/** Posted resolution proposals with their evidence bundles (spec §7). */
export function EvidenceTab({ marketId, outcomes }: { marketId: string; outcomes: string[] }) {
  const proposals = trpc.market.proposals.useQuery({ marketId });

  if (!proposals.data?.length) {
    return (
      <p className="text-sm text-zinc-500">
        No resolution proposed yet. When one is posted, its evidence bundle appears here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {proposals.data.map((p) => (
        <div key={p.id} className="rounded border border-zinc-800 bg-zinc-900/50 p-3 text-sm">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded bg-emerald-950 px-2 py-0.5 text-emerald-400">
              → {outcomes[p.outcomeIdx] ?? `#${p.outcomeIdx}`}
            </span>
            <span className="text-zinc-500">
              proposed by {p.proposer} at {fmtTime(p.ts)}
            </span>
            {p.status === "superseded" && (
              <span className="rounded bg-zinc-800 px-1.5 text-xs text-zinc-500">superseded</span>
            )}
          </div>
          <ul className="space-y-2">
            {(p.evidence as EvidenceItem[]).map((e, i) => (
              <li key={i} className="rounded bg-zinc-950/60 p-2">
                <p className="text-zinc-300">{e.summary}</p>
                <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-zinc-500">
                  <span className="rounded bg-zinc-800 px-1">{e.source}</span>
                  {e.externalRef && <span className="font-mono">{e.externalRef}</span>}
                  {e.url && (
                    <a href={e.url} target="_blank" rel="noreferrer" className="text-emerald-400 underline">
                      source
                    </a>
                  )}
                  {e.archivedUrl && (
                    <a
                      href={e.archivedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-400 underline"
                    >
                      archived copy
                    </a>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
