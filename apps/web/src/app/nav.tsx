"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
          <Link href="/admin" className="nav-link text-warn hover:opacity-80">
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
    </nav>
  );
}
