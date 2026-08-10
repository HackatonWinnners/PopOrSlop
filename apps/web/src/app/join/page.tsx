"use client";

import { useEffect, useState } from "react";
import { deviceFingerprint } from "~/lib/fingerprint";

/**
 * W0 auth-lite: handle + team → funded account. Email optional, only to keep
 * the account after the event. QR posters point here; referral links add ?ref=.
 */
/** Google's mark, inlined — a remote <img> in the auth path is a tracking pixel. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

const OAUTH_MESSAGE: Record<string, string> = {
  cancelled: "Google sign-in was cancelled.",
  state: "That sign-in attempt expired or didn't match. Try again.",
  failed: "Google sign-in failed. Try again, or use a handle below.",
  unavailable: "Google sign-in isn't configured on this deployment yet.",
};

export default function JoinPage() {
  const [handle, setHandle] = useState("");
  const [team, setTeam] = useState("");
  const [email, setEmail] = useState("");
  const [ref, setRef] = useState<string | undefined>();
  const [deviceFp, setDeviceFp] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const param = search.get("ref");
    if (param) setRef(param);
    const oauth = search.get("oauth");
    if (oauth) setOauthError(OAUTH_MESSAGE[oauth] ?? "Google sign-in didn't complete.");
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

      {oauthError && <p className="text-sm text-neg">{oauthError}</p>}

      {/* A plain link, not fetch: the OAuth dance is a top-level navigation. */}
      <a
        href="/api/auth/google"
        className="flex w-full items-center justify-center gap-2.5 rounded-[var(--radius-control)] border border-line-strong bg-surface py-2.5 text-sm font-semibold hover:bg-surface-2"
      >
        <GoogleMark />
        Continue with Google
      </a>
      <p className="text-center text-xs text-faint">
        Signs you in and verifies your email in one step — no link to wait for.
      </p>

      <div className="flex items-center gap-3 pt-1">
        <span className="h-px flex-1 bg-line" />
        <span className="label text-faint">or pick a handle</span>
        <span className="h-px flex-1 bg-line" />
      </div>

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
        <span className="text-muted">
          Email (optional — we send a link to confirm it; keeps your account after the event)
        </span>
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
