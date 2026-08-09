"use client";

import { useState } from "react";
import { trpc } from "~/lib/trpc";

/**
 * Shown while a market sits in its dispute window (spec §7): the proposed
 * outcome, the deadline, and the 50-pt dispute action.
 */
export function DisputeBanner({
  market,
}: {
  market: {
    id: string;
    status: string;
    outcomes: string[];
    resolvedOutcome: number | null;
    disputeDeadline: Date | string | null;
  };
}) {
  const utils = trpc.useUtils();
  const me = trpc.me.useQuery();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const file = trpc.dispute.file.useMutation({
    onSuccess: () => {
      setMessage("Dispute filed — 50 pts staked. The council will review.");
      setOpen(false);
      void utils.market.invalidate();
      void utils.me.invalidate();
    },
    onError: (e) => setMessage(e.message),
  });

  if (market.status === "ESCALATED") {
    return (
      <div className="rounded border border-warn bg-warn-bg p-3 text-sm">
        <p className="font-semibold text-warn">Resolution disputed — under council review.</p>
        {market.resolvedOutcome !== null && (
          <p className="text-muted">
            Proposed outcome: <b>{market.outcomes[market.resolvedOutcome]}</b>
          </p>
        )}
      </div>
    );
  }
  if (market.status !== "DISPUTE_WINDOW") return null;

  const deadline = market.disputeDeadline ? new Date(market.disputeDeadline) : null;
  const stillOpen = deadline !== null && deadline.getTime() > Date.now();

  return (
    <div className="rounded border border-warn bg-warn-bg p-3 text-sm">
      <p>
        <span className="font-semibold text-warn">Resolution proposed:</span>{" "}
        {market.resolvedOutcome !== null && <b>{market.outcomes[market.resolvedOutcome]}</b>}
        {deadline && (
          <span className="text-muted">
            {" "}
            — pays out {stillOpen ? "after" : "at"} {deadline.toLocaleString()} unless disputed
          </span>
        )}
      </p>
      {stillOpen && me.data && !open && (
        <button
          onClick={() => setOpen(true)}
          className="mt-2 rounded bg-warn px-3 py-1 text-xs font-semibold text-accent-ink"
        >
          Dispute (stakes 50 pts)
        </button>
      )}
      {open && (
        <div className="mt-2 space-y-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Why is this outcome wrong? Cite the frozen criteria."
            className="w-full rounded border border-line-strong bg-surface px-2 py-1"
          />
          <div className="flex gap-2">
            <button
              onClick={() => file.mutate({ marketId: market.id, reason })}
              disabled={file.isPending || reason.trim().length < 5}
              className="rounded bg-warn px-3 py-1 text-xs font-bold text-accent-ink disabled:opacity-50"
            >
              Stake 50 pts & dispute
            </button>
            <button onClick={() => setOpen(false)} className="rounded bg-surface-3 px-3 py-1 text-xs">
              Cancel
            </button>
          </div>
          <p className="text-xs text-faint">
            Overturned: stake back + 50-pt bounty. Frivolous: stake slashed.
          </p>
        </div>
      )}
      {message && <p className="mt-2 text-xs text-warn">{message}</p>}
    </div>
  );
}
