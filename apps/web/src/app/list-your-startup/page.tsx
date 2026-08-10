"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, PageHeader, inputClass } from "~/components/ui";
import { trpc } from "~/lib/trpc";

/**
 * Inbound for startups who want a profile and a token.
 *
 * A form, not a mailto: the lead lands in the same table the VC waitlist
 * uses (kind = "startup"), so nothing depends on someone remembering to
 * check an inbox during a hackathon.
 */
export default function ListYourStartupPage() {
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [link, setLink] = useState("");
  const [note, setNote] = useState("");
  const join = trpc.waitlist.join.useMutation();

  if (join.isSuccess) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <Card className="p-6 text-sm">
          <p className="font-semibold text-accent">Got it — we&rsquo;ll be in touch.</p>
          <p className="mt-2 text-muted">
            We read these ourselves, so expect a real reply rather than a drip sequence.
            Meanwhile the markets are open to trade like anyone else.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block font-semibold text-accent underline underline-offset-2"
          >
            Back to the startups →
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader
        title="List your startup"
        blurb="Get a profile, a tradable token, and prediction markets on your milestones — priced by whoever's watching you."
      />

      <Card className="p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            join.mutate({
              email,
              kind: "startup",
              fundName: company || undefined,
              link: link || undefined,
              note: note || undefined,
            });
          }}
          className="space-y-3"
        >
          <label className="block text-sm">
            <span className="label">Startup</span>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              required
              maxLength={200}
              placeholder="Acme Robotics"
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="block text-sm">
            <span className="label">Work email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              autoComplete="email"
              placeholder="you@acme.com"
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="block text-sm">
            <span className="label">Site or deck</span>
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              maxLength={500}
              placeholder="acme.com"
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="block text-sm">
            <span className="label">Anything we should know</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Stage, what you'd want a market on, timing…"
              className={`${inputClass} mt-1`}
            />
          </label>
          {join.error && <p className="text-sm text-neg">{join.error.message}</p>}
          <button
            disabled={join.isPending}
            className="w-full rounded-[var(--radius-control)] bg-accent py-2.5 font-semibold text-accent-ink hover:opacity-90 disabled:opacity-50"
          >
            {join.isPending ? "…" : "Talk to us"}
          </button>
        </form>
      </Card>

      <div className="mt-4 space-y-2 text-xs text-faint">
        <p>
          <b className="text-muted">How listing works.</b> You pay to list; that payment sets
          your token&rsquo;s opening price on a bonding curve, and you receive an allocation of
          your own tokens. The more you put in, the higher the curve starts.
        </p>
        <p>
          Traders buy and sell your token with <b className="text-muted">points</b>, which are
          play money with no cash value and no redemption. Your listing fee is the only real
          money anywhere in this, and it buys placement — never a payout to anyone.
        </p>
      </div>
    </div>
  );
}
