/**
 * The public origin of the current request.
 *
 * Behind Coolify's Traefik the app sees plain http on an internal port, so
 * `req.url` reports the wrong scheme and host. The forwarded headers are the
 * truth. This matters more than cosmetics for OAuth: Google compares the
 * `redirect_uri` byte-for-byte against the registered one, so getting the
 * scheme wrong fails the whole flow with redirect_uri_mismatch.
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
