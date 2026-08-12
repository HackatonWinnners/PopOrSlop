"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function XMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-3.5 w-3.5 fill-current">
      <path d="M18.9 2H22l-7.3 8.3L23.3 22h-6.8l-5.3-7-6.1 7H2l7.8-8.9L1.7 2h7l4.8 6.3L18.9 2Zm-1.2 18h1.9L7.4 4H5.4l12.3 16Z" />
    </svg>
  );
}

/** Drawn from primitives rather than a path — same glyph, a tenth the bytes. */
function InstagramMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
    >
      <rect x="2.2" y="2.2" width="19.6" height="19.6" rx="5.5" />
      <circle cx="12" cy="12" r="4.6" />
      <circle cx="17.6" cy="6.4" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

const SOCIALS = [
  { href: "https://x.com/poporslop", label: "@poporslop", Mark: XMark },
  { href: "https://instagram.com/poporslop", label: "@poporslop", Mark: InstagramMark },
] as const;

const PAGES = [
  ["/batch-odds", "Batch odds"],
  ["/live", "Big-screen mode"],
  ["/list-your-startup", "List your startup"],
] as const;

/**
 * Site footer — mostly here to give the social accounts a permanent home. The
 * quests pay for one follow each; this is where everyone who isn't hunting
 * points finds them. Also carries the play-money disclaimer on every page
 * rather than only where someone thought to write it.
 */
export function Footer() {
  const pathname = usePathname();
  if (pathname === "/live") return null; // big-screen route owns the viewport

  return (
    <footer className="mx-auto w-full max-w-[var(--shell)] border-t border-line px-5 py-6 text-xs text-faint">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {SOCIALS.map(({ href, label, Mark }) => (
          <a
            key={href}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 font-semibold text-muted hover:text-accent"
          >
            <Mark />
            {label}
          </a>
        ))}
        {PAGES.map(([href, label]) => (
          <Link key={href} href={href} className="text-muted hover:text-accent">
            {label}
          </Link>
        ))}
        <span className="basis-full sm:ml-auto sm:basis-auto">
          Points are play money — no cash value, no redemption.
        </span>
      </div>
    </footer>
  );
}
