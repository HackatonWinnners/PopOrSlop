"use client";

import { useState } from "react";

/**
 * W0 auth-lite: handle + team → funded account. Email optional, only to keep
 * the account after the event. QR posters point here.
 */
export default function JoinPage() {
  const [handle, setHandle] = useState("");
  const [team, setTeam] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ handle, team: team || undefined, email: email || undefined }),
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
      <h1 className="text-xl font-bold">Join the market</h1>
      <p className="text-sm text-zinc-400">
        Pick a handle, get <b className="text-emerald-300">1,000 points</b>, start trading. Points
        have no monetary value — ever.
      </p>
      <label className="block text-sm">
        <span className="text-zinc-400">Handle</span>
        <input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          required
          minLength={2}
          maxLength={24}
          pattern="[a-zA-Z0-9_-]+"
          placeholder="ada"
          className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-zinc-400">Team (or leave empty if spectating)</span>
        <input
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          maxLength={80}
          placeholder="Team Rocket"
          className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-zinc-400">Email (optional — keeps your account after the event)</span>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="you@example.com"
          className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2"
        />
      </label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        disabled={busy}
        className="w-full rounded bg-emerald-500 py-2 font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
      >
        {busy ? "…" : "Get 1,000 pts →"}
      </button>
    </form>
  );
}
