"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card, Empty, Logo, PageHeader, SectionLabel, Stat, Tag, inputClass } from "~/components/ui";
import { fmtProb } from "~/lib/format";
import { SUMMERUP_MARKET_SLUG, SUMMERUP_TEAMS } from "~/lib/summerup-teams";
import { trpc } from "~/lib/trpc";

/**
 * The SummerUp event page — the room's view of the field.
 *
 * These teams are not startups in our sense: no profile, no token, no public
 * records to resolve against. They exist as the outcomes of one categorical
 * market, and this page is the readable face of that market: every team with
 * its pitch, ranked by what the room currently believes.
 */
export default function SummerUpPage() {
  const market = trpc.market.bySlug.useQuery(
    { slug: SUMMERUP_MARKET_SLUG },
    { refetchInterval: 3000 },
  );
  const [query, setQuery] = useState("");

  const m = market.data;
  const rows = useMemo(() => {
    // Roster order is outcome order, so index i is outcome i.
    const all = SUMMERUP_TEAMS.map((t, i) => ({
      ...t,
      i,
      p: m?.pricesMicro?.[i] ?? null,
      // The market is the authority on names; the roster only adds pitches.
      name: m?.outcomes?.[i] ?? t.name,
    }));
    return all.sort((a, b) => (b.p ?? 0) - (a.p ?? 0));
  }, [m?.pricesMicro, m?.outcomes]);

  const q = query.trim().toLowerCase();
  const shown = q
    ? rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.description ?? "").toLowerCase().includes(q),
      )
    : rows;

  const leader = rows[0];
  const described = SUMMERUP_TEAMS.filter((t) => t.description).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="SummerUp"
        blurb={
          <>
            Every team in the hackathon, priced by everyone watching it. One
            categorical market, {SUMMERUP_TEAMS.length} outcomes, play money — the
            percentage next to a team is the room&rsquo;s belief that it wins. Read it
            best and there&rsquo;s <b className="text-accent">€100</b> in it.
          </>
        }
      />

      {market.isLoading && <p className="text-faint">Loading the field…</p>}

      {!market.isLoading && !m && (
        <Empty>
          The winner market isn&rsquo;t listed yet. Run{" "}
          <code className="text-muted">pnpm tsx scripts/seed-summerup.ts</code> to open it.
        </Empty>
      )}

      {m && (
        <>
          <Card className="p-4">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <Stat
                label="Favourite"
                value={leader?.name ?? "—"}
                sub={leader?.p !== null && leader ? `${fmtProb(leader.p, 1)} implied` : undefined}
                tone="accent"
              />
              <Stat label="Teams" value={SUMMERUP_TEAMS.length} sub={`${described} with a pitch`} />
              <Stat
                label={m.status === "OPEN" ? "Trading closes" : "Status"}
                value={m.status === "OPEN" ? <Countdown to={m.closeAt} /> : m.status}
                sub={
                  m.status === "OPEN" ? new Date(m.closeAt).toLocaleString() : undefined
                }
              />
              <Link
                href={`/m/${SUMMERUP_MARKET_SLUG}`}
                className="rounded-[var(--radius-control)] bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:opacity-90"
              >
                Open the market →
              </Link>
            </div>
            {m.mClass === 2 && (
              <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-faint">
                <Tag tone="warn">manipulable — for fun</Tag>
                Judged by humans and traded by the contestants, so it&rsquo;s excluded from
                calibration scoring. Trade it for the fun, not for your Brier score.
              </p>
            )}
          </Card>

          <PrizeCard closeAt={m.closeAt} />

          <div>
            <SectionLabel
              index="01"
              right={
                <span className="label text-faint">
                  {q ? `${shown.length} of ${rows.length}` : "ranked by price"}
                </span>
              }
            >
              The field
            </SectionLabel>

            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by team or pitch…"
              className={`${inputClass} mb-2`}
            />

            {shown.length === 0 ? (
              <Empty>Nothing matches “{query}”.</Empty>
            ) : (
              <ul className="space-y-1.5">
                {shown.map((r, rank) => (
                  <li key={r.i}>
                    <Link
                      href={`/m/${SUMMERUP_MARKET_SLUG}?o=${r.i}`}
                      className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-3 py-2.5 hover:border-line-strong"
                    >
                      <span className="tnum w-7 shrink-0 text-right text-xs text-faint">
                        {q ? "" : rank + 1}
                      </span>
                      <Logo name={r.name} size={28} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{r.name}</span>
                        {r.description ? (
                          <span className="block truncate text-xs text-muted">
                            {r.description}
                          </span>
                        ) : (
                          <span className="block text-xs text-faint">no pitch on the hub</span>
                        )}
                      </span>
                      <b className="tnum shrink-0 text-accent">{fmtProb(r.p, 1)}</b>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <SideMarkets />
        </>
      )}
    </div>
  );
}

/**
 * The €100 prize.
 *
 * Deliberately framed as a fixed contest prize for a skill ranking, not a
 * payout on a wager: points can't be bought, so there is no stake and nothing
 * here is redeemable. "Points have no monetary value" stays literally true —
 * the prize is awarded by us for finishing top of a leaderboard, the same way
 * a hackathon awards one. Keep that structure if you edit this copy.
 */
function PrizeCard({ closeAt }: { closeAt: Date | string }) {
  const close = typeof closeAt === "string" ? new Date(closeAt) : closeAt;
  return (
    <Card className="border-accent/40 p-4">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <Stat label="Prize" value="€100" sub="cash, one winner" tone="accent" />
        <div className="min-w-64 flex-1 space-y-2 text-sm">
          <p className="font-semibold">
            €100 to whoever trades this market best.
          </p>
          <p className="text-muted">
            When the winner is announced and the market resolves, we rank every trader by
            profit on <b>this market alone</b> — everything your positions pay out, minus
            everything you spent on them. Biggest number takes the €100.
          </p>
          <ul className="space-y-1 text-xs text-faint">
            <li>
              · Free to enter. Points are given, never sold — there&rsquo;s nothing to stake and
              nothing to lose.
            </li>
            <li>
              · Only trades placed before {close.toLocaleString()} count; that&rsquo;s when the
              market locks.
            </li>
            <li>
              · Profit is measured at resolution, so a paper lead now means nothing until the
              winner is announced.
            </li>
            <li>
              · Ties split the prize. The PopOrSlop team is not eligible — we run the thing.
            </li>
            <li>
              · Your points stay points: they have no cash value and can&rsquo;t be redeemed.
              The prize is ours to award, not your balance converted.
            </li>
          </ul>
        </div>
      </div>
    </Card>
  );
}

/** The other event markets — the ambient ones that aren't about who wins. */
function SideMarkets() {
  const list = trpc.market.list.useQuery(undefined, { refetchInterval: 5000 });
  const others = (list.data ?? []).filter(
    (m) => m.type === "EVENT_DEMO" && m.status === "OPEN" && m.slug !== SUMMERUP_MARKET_SLUG,
  );
  if (others.length === 0) return null;

  return (
    <div>
      <SectionLabel index="02">Also on the event</SectionLabel>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {others.map((m) => (
          <li key={m.id}>
            <Link
              href={`/m/${m.slug}`}
              className="block rounded-[var(--radius-card)] border border-line bg-surface p-3 hover:border-line-strong"
            >
              <span className="block text-sm font-semibold">{m.title}</span>
              <span className="mt-1.5 flex flex-wrap gap-1.5">
                {m.outcomes.map((o, i) => (
                  <span key={i} className="label rounded bg-surface-2 px-1.5 py-0.5 text-muted">
                    {o} <b className="tnum text-accent">{fmtProb(m.pricesMicro?.[i], 0)}</b>
                  </span>
                ))}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Time left until the market locks, in event terms: hours and minutes. */
function Countdown({ to }: { to: Date | string }) {
  const target = typeof to === "string" ? new Date(to) : to;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const ms = target.getTime() - now;
  if (ms <= 0) return <>closing…</>;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  if (d >= 1) return <>{d}d {Math.floor((s % 86400) / 3600)}h</>;
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return <>{hh}:{mm}:{ss}</>;
}
