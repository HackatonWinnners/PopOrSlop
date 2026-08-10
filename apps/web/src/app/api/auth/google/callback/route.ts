import { NextResponse } from "next/server";
import { getSessionUser, signInWithProvenEmail } from "~/server/services/auth";
import { OAUTH_STATE_COOKIE, emailFromCode } from "~/server/services/google-oauth";
import { requestOrigin } from "~/server/request-origin";
import { SESSION_COOKIE, cookieSecure } from "~/server/session-cookie";

function readCookies(req: Request): Record<string, string> {
  return Object.fromEntries(
    (req.headers.get("cookie") ?? "")
      .split(";")
      .map((c) => c.trim().split("=", 2) as [string, string])
      .filter(([k]) => k),
  );
}

/** Google sends the user back here with a code; trade it for a session. */
export async function GET(req: Request) {
  const origin = requestOrigin(req);
  const url = new URL(req.url);
  const params = url.searchParams;
  const cookies = readCookies(req);

  const fail = (reason: string) => {
    const res = NextResponse.redirect(new URL(`/join?oauth=${reason}`, origin));
    res.cookies.delete(OAUTH_STATE_COOKIE);
    return res;
  };

  // The user hit "Cancel" on Google's consent screen — not an error worth shouting about.
  if (params.get("error")) return fail("cancelled");

  const code = params.get("code");
  const state = params.get("state");
  const expected = cookies[OAUTH_STATE_COOKIE];
  // Constant-time comparison isn't needed here (the attacker supplies both
  // sides and learns nothing from timing), but presence and equality are.
  if (!code || !state || !expected || state !== expected) return fail("state");

  try {
    const email = await emailFromCode(code, origin);
    const currentUser = await getSessionUser(cookies[SESSION_COOKIE]);
    const session = await signInWithProvenEmail(email, currentUser);

    const res = NextResponse.redirect(new URL("/?email=verified", origin));
    res.cookies.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: cookieSecure(),
      expires: session.expiresAt,
      path: "/",
    });
    res.cookies.delete(OAUTH_STATE_COOKIE);
    return res;
  } catch (e) {
    console.error("[auth] google callback failed:", e);
    return fail("failed");
  }
}
