"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { fmtPts } from "~/lib/format";
import { trpc } from "~/lib/trpc";

export function Nav() {
  const pathname = usePathname();
  const me = trpc.me.useQuery(undefined, { refetchInterval: 10_000 });
  if (pathname === "/live") return null; // big-screen route owns the viewport
  return (
    <nav className="sticky top-0 z-10 mb-6 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
      <div className="mx-auto flex h-12 w-full max-w-3xl items-center gap-4 px-4 text-sm">
        <Link href="/" className="font-bold tracking-tight text-emerald-400">
          PopOrSlop
        </Link>
        <Link href="/markets" className="text-zinc-400 hover:text-zinc-100">
          Markets
        </Link>
        <Link href="/portfolio" className="text-zinc-400 hover:text-zinc-100">
          Portfolio
        </Link>
        <Link href="/leaderboard" className="text-zinc-400 hover:text-zinc-100">
          Leaders
        </Link>
        <Link href="/quests" className="text-zinc-400 hover:text-zinc-100">
          Quests
        </Link>
        {me.data?.isAdmin && (
          <Link href="/admin" className="text-amber-400 hover:text-amber-300">
            Admin
          </Link>
        )}
        <div className="ml-auto flex items-center gap-2">
          {me.data ? (
            <>
              <span className="text-zinc-400">@{me.data.handle}</span>
              <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-emerald-300">
                {fmtPts(me.data.pointsBalance)} pts
              </span>
            </>
          ) : (
            <Link
              href="/join"
              className="rounded bg-emerald-500 px-3 py-1 font-semibold text-zinc-950 hover:bg-emerald-400"
            >
              Join
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
