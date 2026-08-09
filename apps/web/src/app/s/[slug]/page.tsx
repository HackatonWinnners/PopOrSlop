"use client";

import Link from "next/link";
import { use } from "react";
import { fmtProb } from "~/lib/format";
import { trpc } from "~/lib/trpc";
import { TokenPanel } from "./token-panel";

/** Startup profile: identity, token, and this company's prediction markets. */
export default function StartupPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const startup = trpc.startup.bySlug.useQuery({ slug }, { refetchInterval: 5000 });

  if (startup.isLoading) return <p className="py-8 text-zinc-500">Loading…</p>;
  if (!startup.data) return <p className="py-8 text-zinc-500">No such startup.</p>;
  const s = startup.data;
  const links = Object.entries(s.links ?? {});

  return (
    <div className="space-y-5">
      <header className="flex items-start gap-4 py-2">
        {s.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.logoUrl} alt="" className="h-16 w-16 rounded-lg bg-zinc-800 object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-zinc-800 text-2xl font-bold">
            {s.name[0]}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold">
            {s.name}
            {s.listed && (
              <span className="rounded bg-emerald-950 px-1.5 py-0.5 text-xs font-semibold text-emerald-400">
                LISTED
              </span>
            )}
          </h1>
          {s.description && <p className="mt-1 text-sm text-zinc-400">{s.description}</p>}
          {links.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-3 text-sm">
              {links.map(([label, url]) => (
                <a
                  key={label}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-400 underline"
                >
                  {label} ↗
                </a>
              ))}
            </p>
          )}
        </div>
      </header>

      {s.token ? (
        <TokenPanel companyId={s.id} token={s.token} />
      ) : (
        <p className="rounded border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-500">
          Not listed yet — no token to trade. The prediction markets below are live regardless.
        </p>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-400">
          Prediction markets on {s.name}
        </h2>
        {s.markets.length === 0 && (
          <p className="text-sm text-zinc-500">No markets on this company yet.</p>
        )}
        <div className="space-y-2">
          {s.markets.map((m) => (
            <Link
              key={m.id}
              href={`/m/${m.slug}`}
              className="block rounded border border-zinc-800 bg-zinc-900/50 p-3 hover:border-zinc-600"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{m.title}</span>
                <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">
                  {m.status}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-2 text-sm">
                {m.status === "RESOLVED" && m.resolvedOutcome !== null ? (
                  <span className="text-zinc-300">
                    → <b>{m.outcomes[m.resolvedOutcome]}</b>
                  </span>
                ) : (
                  m.outcomes.slice(0, 3).map((o, i) => (
                    <span key={o} className="rounded bg-zinc-800 px-1.5 py-0.5">
                      {o}{" "}
                      <b className="text-emerald-300">
                        {m.pricesMicro ? fmtProb(m.pricesMicro[i], 0) : "—"}
                      </b>
                    </span>
                  ))
                )}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
