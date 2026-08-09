"use client";

import { useEffect, useState } from "react";
import { deviceFingerprint } from "~/lib/fingerprint";

/**
 * W0 auth-lite: handle + team → funded account. Email optional, only to keep
 * the account after the event. QR posters point here; referral links add ?ref=.
 */
export default function JoinPage() {
  const [handle, setHandle] = useState("");
  const [team, setTeam] = useState("");
  const [email, setEmail] = useState("");
  const [ref, setRef] = useState<string | undefined>();
  const [deviceFp, setDeviceFp] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("ref");
    if (param) setRef(param);
    void deviceFingerprint().then(setDeviceFp);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        handle,
        team: team || undefined,
        email: email || undefined,
        ref,
        deviceFp,
      }),
    });
    if (res.ok) {
      // Hard navigation: reset all client caches so the session is picked up.
      window.location.href = "/";
    } else {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? `signup failed (${res.status})`);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-sm space-y-4 py-8">
      <h1 className="page-title text-3xl font-bold tracking-tight">Join the market</h1>
      <p className="text-sm text-muted">
        Pick a handle, get <b className="text-accent">1,000 points</b>, start trading. Points
        have no monetary value — ever.
      </p>
      {ref && (
        <p className="rounded bg-surface px-3 py-2 text-xs text-muted">
          Invited by <b className="text-accent">@{ref}</b> — they earn 250 pts when you place
          your first trade.
        </p>
      )}
      <label className="block text-sm">
        <span className="text-muted">Handle</span>
        <input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          required
          minLength={2}
          maxLength={24}
          pattern="[a-zA-Z0-9_-]+"
          placeholder="ada"
          className="mt-1 w-full rounded border border-line-strong bg-surface px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-muted">Team (or leave empty if spectating)</span>
        <input
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          maxLength={80}
          placeholder="Team Rocket"
          className="mt-1 w-full rounded border border-line-strong bg-surface px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-muted">Email (optional — keeps your account after the event)</span>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="you@example.com"
          className="mt-1 w-full rounded border border-line-strong bg-surface px-3 py-2"
        />
      </label>
      {error && <p className="text-sm text-neg">{error}</p>}
      <button
        disabled={busy}
        className="w-full rounded bg-accent py-2 font-semibold text-accent-ink hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "…" : "Get 1,000 pts →"}
      </button>
      <MagicLinkLogin />
    </form>
  );
}

/** Returning users (or event accounts that saved an email) sign back in here. */
function MagicLinkLogin() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  async function send() {
    if (!email) return;
    await fetch("/api/auth/magic-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setSent(true);
  }

  return (
    <div className="border-t border-line pt-4 text-sm">
      <p className="mb-2 text-muted">Already have an account? Sign in by email:</p>
      {sent ? (
        <p className="text-accent">
          If that address has an account, a sign-in link is on its way (valid 15 min).
        </p>
      ) : (
        <div className="flex gap-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="you@example.com"
            className="min-w-0 flex-1 rounded border border-line-strong bg-surface px-3 py-2"
          />
          <button
            type="button"
            onClick={send}
            className="shrink-0 rounded bg-surface-3 px-3 py-2 font-semibold hover:bg-surface-3"
          >
            Send link
          </button>
        </div>
      )}
    </div>
  );
}
