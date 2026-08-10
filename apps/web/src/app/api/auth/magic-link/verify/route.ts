import { NextResponse } from "next/server";
import { getSessionUser, verifyMagicLink } from "~/server/services/auth";
import { SESSION_COOKIE, cookieSecure } from "~/server/session-cookie";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return NextResponse.redirect(new URL("/join?link=invalid", url.origin));

  const cookies = Object.fromEntries(
    (req.headers.get("cookie") ?? "")
      .split(";")
      .map((c) => c.trim().split("=", 2) as [string, string])
      .filter(([k]) => k),
  );
  const currentUser = await getSessionUser(cookies[SESSION_COOKIE]);

  try {
    const session = await verifyMagicLink(token, currentUser);
    const res = NextResponse.redirect(new URL("/?email=verified", url.origin));
    res.cookies.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: cookieSecure(),
      expires: session.expiresAt,
      path: "/",
    });
    return res;
  } catch {
    return NextResponse.redirect(new URL("/join?link=invalid", url.origin));
  }
}
