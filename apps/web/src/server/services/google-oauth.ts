import { randomBytes } from "node:crypto";
import { DomainError } from "./errors";

/**
 * "Sign in with Google" — the authorization-code flow, by hand.
 *
 * No library: the flow is two HTTPS calls and a state cookie, and an auth
 * dependency is a supply-chain surface we'd rather not carry for that.
 *
 * We ask for `openid email` and nothing else. We don't want the profile, the
 * avatar, or anything that would put this app in front of Google's sensitive-
 * scope review — an address is the whole point.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export const OAUTH_STATE_COOKIE = "pos_oauth_state";
export const OAUTH_STATE_TTL_S = 600;

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function creds() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new DomainError("BAD_STATE", "Google sign-in is not configured");
  }
  return { clientId, clientSecret };
}

export function redirectUri(origin: string): string {
  return `${origin}/api/auth/google/callback`;
}

/** Random, unguessable, and echoed back by Google — this is the CSRF defence. */
export function newState(): string {
  return randomBytes(32).toString("base64url");
}

export function authUrl(origin: string, state: string): string {
  const { clientId } = creds();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: "openid email",
    state,
    // Always show the chooser: shared laptops at an event are the norm, and
    // silently reusing whoever signed in last is how people trade as someone else.
    prompt: "select_account",
  });
  return `${AUTH_ENDPOINT}?${params}`;
}

interface TokenResponse {
  id_token?: string;
  error?: string;
  error_description?: string;
}

interface IdTokenClaims {
  email?: string;
  email_verified?: boolean | string;
  aud?: string;
  iss?: string;
  exp?: number;
}

/**
 * Decode an ID token's payload without verifying its signature.
 *
 * Safe *only* because of where this token comes from: a direct TLS POST to
 * Google's token endpoint, in response to a code we just issued. Google's own
 * documentation calls signature verification unnecessary on this path — TLS
 * already authenticates the sender. A token arriving any other way (a query
 * param, a client POST) would have to be verified against Google's JWKS, so
 * do not reuse this function for one.
 */
function decodeIdToken(idToken: string): IdTokenClaims {
  const payload = idToken.split(".")[1];
  if (!payload) throw new DomainError("NOT_AUTHORIZED", "malformed ID token");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as IdTokenClaims;
}

/**
 * Exchange an authorization code for a verified email address.
 * Throws unless Google both issued the token to us and vouches for the address.
 */
export async function emailFromCode(code: string, origin: string): Promise<string> {
  const { clientId, clientSecret } = creds();
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri(origin),
      grant_type: "authorization_code",
    }),
  });
  const body = (await res.json().catch(() => null)) as TokenResponse | null;
  if (!res.ok || !body?.id_token) {
    console.error(`[auth] google token exchange failed: ${res.status} ${body?.error ?? ""}`);
    throw new DomainError("NOT_AUTHORIZED", "Google sign-in failed");
  }

  const claims = decodeIdToken(body.id_token);
  // Belt and braces: a token minted for a different client must never sign
  // someone in here, even though the exchange above already implies ours.
  if (claims.aud !== clientId) throw new DomainError("NOT_AUTHORIZED", "ID token audience mismatch");
  if (claims.iss !== "accounts.google.com" && claims.iss !== "https://accounts.google.com") {
    throw new DomainError("NOT_AUTHORIZED", "ID token issuer mismatch");
  }
  // Google serialises this as a boolean or the string "true" depending on flow.
  const verified = claims.email_verified === true || claims.email_verified === "true";
  if (!claims.email || !verified) {
    throw new DomainError("NOT_AUTHORIZED", "Google has not verified that address");
  }
  return claims.email.toLowerCase();
}
