import { NextResponse } from "next/server";
import { requestOrigin } from "~/server/request-origin";
import { getSessionUser } from "~/server/services/auth";
import { startQuest } from "~/server/services/quests";
import { SESSION_COOKIE } from "~/server/session-cookie";

/**
 * Outbound hop for a partner quest: record that this user left for the
 * partner, then redirect them there with their deep-link payload attached.
 *
 * A redirect rather than a plain <a href>, so the click is witnessed by the
 * server. Signed-out visitors go to /join first — an anonymous click proves
 * nothing and belongs to nobody.
 */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const origin = requestOrigin(req);
  const cookies = Object.fromEntries(
    (req.headers.get("cookie") ?? "")
      .split(";")
      .map((c) => c.trim().split("=", 2) as [string, string])
      .filter(([k]) => k),
  );

  const user = await getSessionUser(cookies[SESSION_COOKIE]);
  if (!user) return NextResponse.redirect(new URL("/join", origin));

  try {
    const target = await startQuest(user.id, slug);
    return NextResponse.redirect(target);
  } catch (e) {
    console.error("[quests] start failed:", e);
    return NextResponse.redirect(new URL("/quests", origin));
  }
}
