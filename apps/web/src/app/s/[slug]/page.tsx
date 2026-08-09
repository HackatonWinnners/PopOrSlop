"use client";

import Link from "next/link";
import { use } from "react";
import { Card, Empty, Logo, SectionLabel, Tag } from "~/components/ui";
import { fmtProb } from "~/lib/format";
import { trpc } from "~/lib/trpc";
import { TokenPanel } from "./token-panel";

/** Startup profile: identity, token, and this company's prediction markets. */
export default function StartupPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const startup = trpc.startup.bySlug.useQuery({ slug }, { refetchInterval: 5000 });

  if (startup.isLoading) return <p className="py-10 text-sm text-faint">Loading…</p>;
  if (!startup.data) return <p className="py-10 text-sm text-faint">No such startup.</p>;
  const s = startup.data;
  const links = Object.entries(s.links ?? {});

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-4 py-6">
        <Logo name={s.name} url={s.logoUrl} size={64} />
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight">
            {s.name}
            {s.listed && <Tag tone="accent">Listed</Tag>}
          </h1>
          {s.description && <p className="mt-1 max-w-2xl text-sm text-muted">{s.description}</p>}
          {links.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {links.map(([label, url]) => (
                <a
                  key={label}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-[var(--radius-control)] border border-line bg-surface px-2 py-1 font-mono text-xs text-accent hover:border-accent"
                >
                  {label} ↗
                </a>
              ))}
            </div>
          )}
        </div>
      </header>

      {s.token ? (
        <TokenPanel companyId={s.id} token={s.token} />
      ) : (
        <Card className="p-4 text-sm text-muted">
          Not listed yet — no token to trade. The prediction markets below are live regardless.
        </Card>
      )}

      <section>
        <SectionLabel index="02">Prediction markets on {s.name}</SectionLabel>
        {s.markets.length === 0 ? (
          <Empty>No markets on this startup yet.</Empty>
        ) : (
          <div className="space-y-2">
            {s.markets.map((m) => (
              <Link key={m.id} href={`/m/${m.slug}`} className="group block">
                <Card className="p-3 transition-colors group-hover:border-line-strong">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold">{m.title}</span>
                    <Tag tone={m.status === "OPEN" ? "pos" : "neutral"}>{m.status}</Tag>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-3 text-sm">
                    {m.status === "RESOLVED" && m.resolvedOutcome !== null ? (
                      <span className="text-ink-2">
                        → <b>{m.outcomes[m.resolvedOutcome]}</b>
                      </span>
                    ) : (
                      m.outcomes.slice(0, 3).map((o, i) => (
                        <span key={o} className="text-muted">
                          {o}{" "}
                          <b className="tnum text-accent">
                            {m.pricesMicro ? fmtProb(m.pricesMicro[i], 0) : "—"}
                          </b>
                        </span>
                      ))
                    )}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
