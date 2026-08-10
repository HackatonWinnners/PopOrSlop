"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { MagicLinkForm } from "~/components/magic-link-form";

/**
 * Sign-in for people who already have an account. No passwords: the only
 * credential is control of the mailbox, same as verification.
 */
function Login() {
  const [linkInvalid, setLinkInvalid] = useState(false);

  useEffect(() => {
    setLinkInvalid(new URLSearchParams(window.location.search).get("link") === "invalid");
  }, []);

  return (
    <div className="mx-auto max-w-sm space-y-4 py-8">
      <h1 className="page-title text-3xl font-bold tracking-tight">Log in</h1>
      <p className="text-sm text-muted">
        We&rsquo;ll email you a sign-in link. No password to remember.
      </p>

      {linkInvalid && (
        <p className="rounded-[var(--radius-control)] bg-warn-bg px-3 py-2.5 text-sm text-warn">
          That link had already been used or expired. Links last 15 minutes — here&rsquo;s a
          fresh one.
        </p>
      )}

      <MagicLinkForm autoFocus />

      <p className="border-t border-line pt-4 text-sm text-muted">
        No account yet?{" "}
        <Link href="/join" className="font-semibold text-accent underline underline-offset-2">
          Join and get 1,000 points
        </Link>
        .
      </p>
      <p className="text-xs text-faint">
        Signed up at an event with just a handle and never added an email? That account can only
        be reached from the browser you made it in — open the site there and add an email from
        the banner.
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <Login />
    </Suspense>
  );
}
