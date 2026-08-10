/**
 * The public origin of the current request.
 *
 * Behind Coolify's Traefik the app sees plain http on an internal port, so
 * `req.url` reports the wrong scheme and host. The forwarded headers are the
 * truth. Getting this wrong mails people a sign-in link pointing at
 * localhost:3000 — the link is valid, but it goes nowhere they can reach.
 *
 * PUBLIC_ORIGIN overrides everything — set it if the app ever sits behind a
 * proxy that doesn't forward these headers.
 */
export function requestOrigin(req: Request): string {
  const configured = process.env.PUBLIC_ORIGIN;
  if (configured) return configured.replace(/\/$/, "");
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}
