export const SESSION_COOKIE = "pos_session";

/**
 * Whether to set the Secure flag, decided per request rather than globally.
 *
 * This deployment answers on two hostnames at once: the real domain over
 * HTTPS, and the legacy sslip.io host over plain http. A single env flag
 * can't be right for both — Secure cookies are silently dropped over http,
 * so forcing it on would log out everyone still on the old host, and none
 * of them have a verified email to sign back in with.
 *
 * So: trust the forwarded protocol. HTTPS requests get Secure cookies;
 * plain-http ones keep working until the old host is retired.
 */
export function cookieSecure(req?: Request): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  if (!req) return false;
  return req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
}
