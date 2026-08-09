"use client";

import { useState } from "react";
import { fmtPts, fmtTime } from "~/lib/format";
import { trpc } from "~/lib/trpc";

export function QuestsAdmin() {
  const utils = trpc.useUtils();
  const submissions = trpc.quest.submissions.useQuery(undefined, { refetchInterval: 15_000 });
  const review = trpc.quest.review.useMutation({
    onSuccess: () => void utils.quest.invalidate(),
  });
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="space-y-4">
      <button
        onClick={() => setShowCreate((v) => !v)}
        className="rounded bg-zinc-700 px-3 py-1.5 text-sm font-semibold hover:bg-zinc-600"
      >
        {showCreate ? "Hide quest form" : "+ New quest"}
      </button>
      {showCreate && <CreateQuestForm onDone={() => setShowCreate(false)} />}

      <h3 className="text-sm font-semibold text-zinc-400">Submissions</h3>
      {!submissions.data?.length && <p className="text-sm text-zinc-500">None yet.</p>}
      <ul className="space-y-2 text-sm">
        {submissions.data?.map((s) => (
          <li key={s.id} className="rounded border border-zinc-800 bg-zinc-900/50 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded px-1.5 py-0.5 text-xs ${
                  s.status === "pending"
                    ? "bg-amber-950 text-amber-400"
                    : s.status === "approved"
                      ? "bg-emerald-950 text-emerald-400"
                      : "bg-zinc-800 text-zinc-500"
                }`}
              >
                {s.status}
              </span>
              <span className="font-medium">@{s.handle}</span>
              <span className="text-zinc-400">{s.questTitle}</span>
              <span className="ml-auto font-mono text-xs text-zinc-500">
                +{fmtPts(s.reward, 0)} pts · {fmtTime(s.createdAt)}
              </span>
            </div>
            {s.proof && <p className="mt-1 text-zinc-300">“{s.proof}”</p>}
            {s.status === "pending" && (
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => review.mutate({ completionId: s.id, approve: true })}
                  disabled={review.isPending}
                  className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold"
                >
                  Approve & pay
                </button>
                <button
                  onClick={() => review.mutate({ completionId: s.id, approve: false })}
                  disabled={review.isPending}
                  className="rounded bg-zinc-700 px-2 py-1 text-xs"
                >
                  Reject
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CreateQuestForm({ onDone }: { onDone: () => void }) {
  const utils = trpc.useUtils();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<"auto" | "code" | "manual">("manual");
  const [rule, setRule] = useState<"first_trade" | "email_set" | "traded_3_markets">("first_trade");
  const [codeValue, setCodeValue] = useState("");
  const [reward, setReward] = useState(1000);
  const [error, setError] = useState<string | null>(null);

  const create = trpc.quest.create.useMutation({
    onSuccess: () => {
      void utils.quest.invalidate();
      onDone();
    },
    onError: (e) => setError(e.message),
  });

  const input = "mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        create.mutate({
          title,
          slug: slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
          description,
          url: url || undefined,
          kind,
          rule: kind === "auto" ? rule : undefined,
          code: kind === "code" ? codeValue : undefined,
          rewardPoints: reward,
        });
      }}
      className="space-y-3 rounded border border-zinc-800 bg-zinc-900/50 p-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-zinc-400">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required className={input} />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-400">Slug (auto if empty)</span>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} className={input} />
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-zinc-400">Description (what to do, what counts)</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          required
          className={input}
        />
      </label>
      <div className="grid grid-cols-3 gap-3">
        <label className="block text-sm">
          <span className="text-zinc-400">Kind</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as never)} className={input}>
            <option value="manual">manual — proof + review</option>
            <option value="code">code — redemption code</option>
            <option value="auto">auto — internal check</option>
          </select>
        </label>
        {kind === "auto" && (
          <label className="block text-sm">
            <span className="text-zinc-400">Rule</span>
            <select value={rule} onChange={(e) => setRule(e.target.value as never)} className={input}>
              <option value="first_trade">placed a trade</option>
              <option value="email_set">added an email</option>
              <option value="traded_3_markets">traded 3 markets</option>
            </select>
          </label>
        )}
        {kind === "code" && (
          <label className="block text-sm">
            <span className="text-zinc-400">Code (share with the partner)</span>
            <input value={codeValue} onChange={(e) => setCodeValue(e.target.value)} required className={input} />
          </label>
        )}
        <label className="block text-sm">
          <span className="text-zinc-400">Reward (pts)</span>
          <input
            type="number"
            min={1}
            value={reward}
            onChange={(e) => setReward(Number(e.target.value))}
            className={input}
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-zinc-400">External URL (optional)</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className={input} />
      </label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        disabled={create.isPending}
        className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
      >
        {create.isPending ? "…" : "Create quest"}
      </button>
    </form>
  );
}
