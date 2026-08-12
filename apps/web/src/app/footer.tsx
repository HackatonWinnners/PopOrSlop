"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const X_URL = "https://x.com/poporslop";

function XMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-3.5 w-3.5 fill-current">
      <path d="M18.9 2H22l-7.3 8.3L23.3 22h-6.8l-5.3-7-6.1 7H2l7.8-8.9L1.7 2h7l4.8 6.3L18.9 2Zm-1.2 18h1.9L7.4 4H5.4l12.3 16Z" />
    </svg>
  );
}

/**
 * Site footer — mostly here to give the X account a permanent home. The quest
 * pays for one follow; this is where everyone who isn't hunting points finds
 * it. Also carries the play-money disclaimer on every page rather than only
 * where someone thought to write it.
 */
export function Footer() {
  const pathname = usePathname();
  if (pathname === "/live") return null; // big-screen route owns the viewport

  return (
    <footer className="mx-auto w-full max-w-[var(--shell)] border-t border-line px-5 py-6 text-xs text-faint">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <a
          href={X_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 font-semibold text-muted hover:text-accent"
        >
          <XMark />
          @poporslop
        </a>
        <Link href="/batch-odds" className="text-muted hover:text-accent">
          Batch odds
        </Link>
        <Link href="/live" className="text-muted hover:text-accent">
          Big-screen mode
        </Link>
        <Link href="/list-your-startup" className="text-muted hover:text-accent">
          List your startup
        </Link>
        <span className="basis-full sm:ml-auto sm:basis-auto">
          Points are play money — no cash value, no redemption.
        </span>
      </div>
    </footer>
  );
}
