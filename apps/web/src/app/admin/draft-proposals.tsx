"use client";

import { useState } from "react";
import { trpc } from "~/lib/trpc";

/** Auto-resolver output: drafts the admin reviews and posts (spec §7). */
export function DraftProposals() {
  const utils = trpc.useUtils();
  const drafts = trpc.admin.draftProposals.useQuery(undefined, { refetchInterval: 30_000 });
  const [error, setError] = useState<string | null>(null);
  const post = trpc.admin.postDraft.useMutation({
    onSuccess: () => {
      void utils.admin.invalidate();
      void utils.market.invalidate();
    },
    onError: (e) => setError(e.message),
  });

  if (!drafts.data?.length) return null;

  return (
    <div className="rounded border border-accent bg-accent-soft p-3">
      <p className="mb-2 text-sm font-semibold text-accent">
        Auto-resolver drafts awaiting review ({drafts.data.length})
      </p>
      {error && <p className="mb-2 text-xs text-neg">{error}</p>}
      <ul className="space-y-2 text-sm">
        {drafts.data.map((d) => {
          const summary = (d.evidence as { summary?: string }[])[0]?.summary;
          return (
            <li key={d.id} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{d.title}</span>
              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">
                → {d.outcomes[d.outcomeIdx]}
              </span>
              {summary && <span className="truncate text-xs text-muted">{summary}</span>}
              <span className="ml-auto flex gap-1.5">
                <button
                  onClick={() => post.mutate({ proposalId: d.id, disputeWindowHours: 48 })}
                  disabled={post.isPending}
                  className="rounded bg-accent px-2 py-1 text-xs font-semibold"
                >
                  Post (48h window)
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
