"use client";

import { useState } from "react";
import { inputClass } from "~/components/ui";

/**
 * Request a sign-in link. Shared by /login and the footer of /join so the two
 * entry points can't drift.
 *
 * The confirmation is deliberately non-committal ("if that address has an
 * account") — the endpoint always answers 200, and saying "no such account"
 * here would hand anyone a way to test whether an address is registered.
 */
export function MagicLinkForm({ autoFocus = false }: { autoFocus?: boolean }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setBusy(true);
    await fetch("/api/auth/magic-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    setSent(true);
    setBusy(false);
  }

  if (sent) {
    return (
      <p className="rounded-[var(--radius-control)] bg-accent-soft px-3 py-2.5 text-sm text-accent">
        If that address has an account, a sign-in link is on its way. It&rsquo;s valid for 15
        minutes.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        type="email"
        required
        autoFocus={autoFocus}
        autoComplete="email"
        placeholder="you@example.com"
        className={`${inputClass} min-w-0 flex-1`}
      />
      <button
        disabled={busy}
        className="shrink-0 rounded-[var(--radius-control)] bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "…" : "Send link"}
      </button>
    </form>
  );
}
