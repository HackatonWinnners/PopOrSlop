"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ThemeToggle } from "~/components/theme-toggle";
import { fmtPts } from "~/lib/format";
import { trpc } from "~/lib/trpc";

const LINKS = [
  ["/summerup", "SummerUp"],
  ["/markets", "Markets"],
  ["/portfolio", "Portfolio"],
  ["/leaderboard", "Leaderboard"],
  ["/quests", "Quests"],
] as const;

/**
 * Sign out, then hard-navigate rather than router.push: the session cookie is
 * gone, but every cached tRPC result in memory still belongs to the old user,
 * and a soft navigation would keep showing their balance and positions.
 */
function SignOut({ className = "" }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
        window.location.href = "/";
      }}
      className={`nav-link text-muted hover:text-ink disabled:opacity-50 ${className}`}
    >
      {busy ? "…" : "Log out"}
    </button>
  );
}

export function Nav() {
  const pathname = usePathname();
  const me = trpc.me.useQuery(undefined, { refetchInterval: 10_000 });
  if (pathname === "/live") return null; // big-screen route owns the viewport

  return (
    <nav className="sticky top-0 z-20 mb-2 border-b border-line bg-bg/95 backdrop-blur">
      <div className="mx-auto flex h-[52px] w-full max-w-[var(--shell)] items-center gap-5 px-5 text-sm">
        <Link href="/" className="shrink-0 font-bold tracking-tight">
          {/* Each theme has its own wordmark. */}
          <span className="wordmark-paper">
            Pop<span className="text-accent">Or</span>Slop
          </span>
          <span className="wordmark-term label !text-[13px] !tracking-[0.1em] text-accent">
            POP/SLOP
          </span>
        </Link>
        {LINKS.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className={`nav-link hidden sm:inline ${
              pathname.startsWith(href) ? "text-ink" : "text-muted hover:text-ink"
            }`}
          >
            {label}
          </Link>
        ))}
        {me.data?.isAdmin && (
          <Link href="/admin" className="nav-link hidden text-warn hover:opacity-80 sm:inline">
            Admin
          </Link>
        )}
        <div className="ml-auto flex items-center gap-2">
          {me.data ? (
            <>
              <span className="hidden text-muted sm:inline">@{me.data.handle}</span>
              <span className="tnum rounded-[var(--radius-control)] bg-accent-soft px-2 py-1 text-accent">
                {fmtPts(me.data.pointsBalance)} pts
              </span>
              <SignOut className="hidden sm:inline" />
            </>
          ) : (
            <>
              <Link href="/login" className="nav-link text-muted hover:text-ink">
                Log in
              </Link>
              <Link
                href="/join"
                className="rounded-[var(--radius-control)] bg-accent px-3 py-1.5 font-semibold text-accent-ink hover:opacity-90"
              >
                Join
              </Link>
            </>
          )}
          <ThemeToggle />
        </div>
      </div>

      {/*
       * Phone nav. The links above collapse at sm, which left phones with no
       * way to reach any page at all — and this is a QR-poster event, so
       * phones are the common case, not the edge one.
       *
       * A scrolling row rather than a hamburger: six destinations don't earn
       * a menu, and one tap beats two when you're standing in a venue.
       */}
      <div className="flex gap-4 overflow-x-auto border-t border-line px-5 py-2 text-sm [scrollbar-width:none] sm:hidden [&::-webkit-scrollbar]:hidden">
        {LINKS.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className={`nav-link shrink-0 ${
              pathname.startsWith(href) ? "text-ink" : "text-muted"
            }`}
          >
            {label}
          </Link>
        ))}
        {me.data?.isAdmin && (
          <Link href="/admin" className="nav-link shrink-0 text-warn">
            Admin
          </Link>
        )}
        {me.data && (
          <>
            <span className="shrink-0 text-faint">@{me.data.handle}</span>
            <SignOut className="shrink-0" />
          </>
        )}
      </div>
    </nav>
  );
}
