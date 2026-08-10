"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { inputClass } from "~/components/ui";
import { trpc } from "~/lib/trpc";

/**
 * Nudge bar for the unverified: an address only survives account recovery
 * once it's been proven, so the quest reward and the "keep your account"
 * promise both hang off this. Dismissible — it reappears next session.
 */
function Banner() {
  const params = useSearchParams();
  const pathname = usePathname();
  const utils = trpc.useUtils();
  const me = trpc.me.useQuery();
  const [dismissed, setDismissed] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const send = trpc.auth.requestEmailVerification.useMutation({
    onSuccess: () => {
      setSent(true);
      void utils.me.invalidate();
    },
  });

  if (pathname === "/live") return null; // big-screen route owns the viewport

  if (params.get("email") === "verified") {
    return (
      <Bar tone="ok">
        <span>Email confirmed — your account is now recoverable.</span>
      </Bar>
    );
  }

  const user = me.data;
  if (!user || user.emailVerified || dismissed) return null;

  const claimed = user.pendingEmail ?? user.email;

  return (
    <Bar tone="warn">
      {sent ? (
        <span>Check your inbox — the link is valid for 15 minutes.</span>
      ) : claimed ? (
        <>
          <span>
            Confirm <b>{claimed}</b> to keep your account (and claim the verify-email quest).
          </span>
          <a href="/api/auth/google" className="shrink-0 font-semibold text-accent underline underline-offset-2">
            Verify with Google
          </a>
          <button
            type="button"
            onClick={() => send.mutate({})}
            disabled={send.isPending}
            className="shrink-0 text-muted underline underline-offset-2 hover:text-ink disabled:opacity-50"
          >
            {send.isPending ? "sending…" : "or email me a link"}
          </button>
        </>
      ) : (
        <>
          <span className="shrink-0">
            Keep your account past the event —{" "}
            <a href="/api/auth/google" className="font-semibold text-accent underline underline-offset-2">
              verify with Google
            </a>
            , or:
          </span>
          <form
            className="flex min-w-0 flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (email) send.mutate({ email });
            }}
          >
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              placeholder="you@example.com"
              className={`${inputClass} min-w-0 flex-1 py-1`}
            />
            <button
              disabled={send.isPending}
              className="shrink-0 font-semibold text-accent underline underline-offset-2 disabled:opacity-50"
            >
              {send.isPending ? "sending…" : "Send link"}
            </button>
          </form>
        </>
      )}
      {send.error && <span className="text-neg">{send.error.message}</span>}
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="ml-auto shrink-0 text-faint hover:text-ink"
      >
        ✕
      </button>
    </Bar>
  );
}

function Bar({ tone, children }: { tone: "ok" | "warn"; children: React.ReactNode }) {
  return (
    <div
      className={`border-b text-sm ${
        tone === "ok" ? "border-line bg-accent-soft text-accent" : "border-line bg-surface-2"
      }`}
    >
      <div className="mx-auto flex w-full max-w-[var(--shell)] flex-wrap items-center gap-3 px-5 py-2">
        {children}
      </div>
    </div>
  );
}

export function EmailBanner() {
  // useSearchParams needs a Suspense boundary under the App Router.
  return (
    <Suspense fallback={null}>
      <Banner />
    </Suspense>
  );
}
