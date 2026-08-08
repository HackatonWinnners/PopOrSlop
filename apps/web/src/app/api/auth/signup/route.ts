import { NextResponse } from "next/server";
import { z } from "zod";
import { DomainError } from "~/server/services/errors";
import { signup } from "~/server/services/auth";
import { SESSION_COOKIE } from "~/server/session-cookie";

const bodySchema = z.object({
  handle: z.string().min(2).max(24),
  team: z.string().max(80).optional(),
  email: z.string().email().optional().or(z.literal("")),
});

// Naive per-IP rate limit — enough against QR-poster abuse at room scale.
// Override for load tests: SIGNUP_RATE_LIMIT_PER_MIN=100000
const LIMIT_PER_MIN = Number(process.env.SIGNUP_RATE_LIMIT_PER_MIN ?? 10);
const hits = new Map<string, { count: number; resetAt: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || h.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  h.count++;
  return h.count > LIMIT_PER_MIN;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "rate limited, try again shortly" }, { status: 429 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  try {
    const { token, expiresAt } = await signup({
      handle: parsed.data.handle,
      team: parsed.data.team || undefined,
      email: parsed.data.email || undefined,
    });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      expires: expiresAt,
      path: "/",
    });
    return res;
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
