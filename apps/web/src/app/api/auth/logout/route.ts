import { NextResponse } from "next/server";
import { revokeSession } from "~/server/services/auth";
import { SESSION_COOKIE } from "~/server/session-cookie";

/**
 * Sign out. Clears the cookie *and* deletes the session row — dropping the
 * cookie alone would leave a token that still works for 30 days if anyone
 * had a copy of it, which is not what "log out" means on a shared phone.
 */
export async function POST(req: Request) {
  const cookies = Object.fromEntries(
    (req.headers.get("cookie") ?? "")
      .split(";")
      .map((c) => c.trim().split("=", 2) as [string, string])
      .filter(([k]) => k),
  );
  await revokeSession(cookies[SESSION_COOKIE]);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, maxAge: 0, path: "/" });
  return res;
}
