"use client";

import { useState } from "react";
import { fmtPts } from "~/lib/format";
import { trpc } from "~/lib/trpc";

/** Quests: complete a task (in-app or external), earn points. */
export default function QuestsPage() {
  const me = trpc.me.useQuery();
  const questList = trpc.quest.list.useQuery(undefined, { refetchInterval: 15_000 });

  return (
    <div className="space-y-3">
      <header className="py-2">
        <h1 className="page-title text-3xl font-bold tracking-tight">Quests</h1>
        <p className="text-sm text-muted">
          Earn extra points for completing tasks. Rewards land instantly for verifiable quests;
          proof-based ones are reviewed by an admin.
        </p>
      </header>
      {!me.data && (
        <p className="rounded border border-line p-4 text-sm text-muted">
          <a href="/join" className="text-accent underline">
            Join
          </a>{" "}
          to claim quests.
        </p>
      )}
      {questList.data?.length === 0 && (
        <p className="rounded border border-line p-6 text-center text-sm text-faint">
          No quests live right now.
        </p>
      )}
      {questList.data?.map((q) => <QuestCard key={q.slug} quest={q} signedIn={!!me.data} />)}
    </div>
  );
}

function QuestCard({
  quest,
  signedIn,
}: {
  quest: {
    slug: string;
    title: string;
    description: string;
    url: string | null;
    kind: "auto" | "code" | "manual";
    reward: bigint;
    myStatus: "pending" | "approved" | "rejected" | null;
  };
  signedIn: boolean;
}) {
  const utils = trpc.useUtils();
  const [code, setCode] = useState("");
  const [proof, setProof] = useState("");
  const [error, setError] = useState<string | null>(null);
  const claim = trpc.quest.claim.useMutation({
    onSuccess: () => {
      setError(null);
      void utils.quest.list.invalidate();
      void utils.me.invalidate();
    },
    onError: (e) => setError(e.message),
  });

  const submit = () => {
    setError(null);
    claim.mutate({
      questSlug: quest.slug,
      code: quest.kind === "code" ? code : undefined,
      proof: quest.kind === "manual" ? proof : undefined,
    });
  };

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{quest.title}</h2>
          <p className="mt-1 text-sm text-muted">{quest.description}</p>
          {quest.url && (
            <a
              href={quest.url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-sm text-accent underline"
            >
              open task ↗
            </a>
          )}
        </div>
        <span className="shrink-0 rounded bg-accent-soft px-2 py-1 font-mono text-sm text-accent">
          +{fmtPts(quest.reward, 0)} pts
        </span>
      </div>

      {signedIn && (
        <div className="mt-3">
          {quest.myStatus === "approved" && (
            <p className="text-sm font-semibold text-accent">✓ completed — points paid</p>
          )}
          {quest.myStatus === "pending" && (
            <p className="text-sm text-warn">⧗ submitted — awaiting admin review</p>
          )}
          {quest.myStatus === "rejected" && (
            <p className="text-sm text-faint">✗ submission rejected</p>
          )}
          {quest.myStatus === null && (
            <div className="flex flex-wrap items-center gap-2">
              {quest.kind === "code" && (
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="redemption code"
                  className="rounded border border-line-strong bg-surface px-3 py-1.5 text-sm"
                />
              )}
              {quest.kind === "manual" && (
                <input
                  value={proof}
                  onChange={(e) => setProof(e.target.value)}
                  placeholder="proof (link or your username there)"
                  className="min-w-64 flex-1 rounded border border-line-strong bg-surface px-3 py-1.5 text-sm"
                />
              )}
              <button
                onClick={submit}
                disabled={claim.isPending}
                className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink hover:opacity-90 disabled:opacity-50"
              >
                {quest.kind === "auto" ? "Claim" : quest.kind === "code" ? "Redeem" : "Submit proof"}
              </button>
            </div>
          )}
          {error && <p className="mt-1 text-sm text-neg">{error}</p>}
        </div>
      )}
    </div>
  );
}
