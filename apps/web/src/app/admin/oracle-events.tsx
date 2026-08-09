"use client";

import { trpc } from "~/lib/trpc";

/** W1 review queue: recent oracle events, pending fuzzy matches first. */
export function OracleEvents() {
  const utils = trpc.useUtils();
  const events = trpc.admin.oracleEvents.useQuery({ limit: 50 }, { refetchInterval: 30_000 });
  const setStatus = trpc.admin.setMatchStatus.useMutation({
    onSuccess: () => void utils.admin.oracleEvents.invalidate(),
  });

  if (!events.data?.length) {
    return <p className="py-6 text-sm text-faint">No oracle events ingested yet. Run the workers.</p>;
  }

  return (
    <ul className="divide-y divide-line text-sm">
      {events.data.map((e) => {
        const p = e.parsed as Record<string, string>;
        return (
          <li key={`${e.id}-${e.company_id ?? "none"}`} className="flex flex-wrap items-center gap-2 py-2">
            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">{e.source}</span>
            <span className="truncate font-medium">
              {p.issuer_name ?? p.company_name ?? e.external_ref}
            </span>
            {p.total_offering_amount && (
              <span className="text-muted">${Number(p.total_offering_amount).toLocaleString()}</span>
            )}
            {e.raw_url && (
              <a href={e.raw_url} target="_blank" rel="noreferrer" className="text-xs text-accent underline">
                filing
              </a>
            )}
            <span className="ml-auto flex items-center gap-2">
              {e.match_status === "pending" && e.company_id ? (
                <>
                  <span className="text-warn">
                    ≈ {e.company_name} ({Math.round((e.confidence ?? 0) * 100)}%)
                  </span>
                  <button
                    onClick={() =>
                      setStatus.mutate({ oracleEventId: e.id, companyId: e.company_id!, status: "confirmed" })
                    }
                    className="rounded bg-accent px-2 py-0.5 text-xs font-semibold"
                  >
                    confirm
                  </button>
                  <button
                    onClick={() =>
                      setStatus.mutate({ oracleEventId: e.id, companyId: e.company_id!, status: "rejected" })
                    }
                    className="rounded bg-surface-3 px-2 py-0.5 text-xs"
                  >
                    reject
                  </button>
                </>
              ) : e.match_status === "confirmed" ? (
                <span className="text-accent">→ {e.company_name}</span>
              ) : e.match_status === "rejected" ? (
                <span className="text-faint">rejected: {e.company_name}</span>
              ) : (
                <span className="text-faint">unmatched</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
