import { NextResponse } from "next/server";
import { z } from "zod";
import { requestOrigin } from "~/server/request-origin";
import { requestMagicLink } from "~/server/services/auth";

const bodySchema = z.object({ email: z.string().email() });

// Modest per-IP limit; the route always answers ok so account existence
// (and rate limiting itself) leaks nothing useful.
const hits = new Map<string, { count: number; resetAt: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || h.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  h.count++;
  return h.count > 5;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (parsed.success && !rateLimited(ip)) {
    await requestMagicLink(parsed.data.email, requestOrigin(req)).catch((e) =>
      console.error("[auth] magic link request failed:", e),
    );
  }
  return NextResponse.json({ ok: true });
}
