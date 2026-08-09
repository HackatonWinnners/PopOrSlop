export const SESSION_COOKIE = "pos_session";

/**
 * Secure cookies require HTTPS end-to-end; browsers silently drop them over
 * plain http. Until the deployment has TLS (real domain), COOKIE_SECURE=false
 * keeps sessions working. Flip it back (or unset) once HTTPS is on.
 */
export function cookieSecure(): boolean {
  if (process.env.COOKIE_SECURE === "false") return false;
  return process.env.NODE_ENV === "production";
}
