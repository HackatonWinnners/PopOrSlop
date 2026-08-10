import { NextResponse } from "next/server";
import {
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_S,
  authUrl,
  googleConfigured,
  newState,
} from "~/server/services/google-oauth";
import { cookieSecure } from "~/server/session-cookie";
import { requestOrigin } from "~/server/request-origin";

/** Kick off Google sign-in: stash a state nonce, bounce to Google. */
export async function GET(req: Request) {
  const origin = requestOrigin(req);
  if (!googleConfigured()) {
    return NextResponse.redirect(new URL("/join?oauth=unavailable", origin));
  }

  const state = newState();
  const res = NextResponse.redirect(authUrl(origin, state));
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    // Lax, not Strict: Google's redirect back is a cross-site navigation, and
    // a Strict cookie would not be sent with it — the callback would see no
    // state and reject every legitimate sign-in.
    sameSite: "lax",
    secure: cookieSecure(),
    maxAge: OAUTH_STATE_TTL_S,
    path: "/",
  });
  return res;
}
