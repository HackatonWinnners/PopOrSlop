/**
 * Best-effort device fingerprint (spec §8). Deliberately simple — stable
 * browser signals hashed client-side. It only needs to catch lazy multi-
 * accounting (referral farming, sockpuppets); the public rules are the
 * real deterrent, not this.
 */
export async function deviceFingerprint(): Promise<string | undefined> {
  try {
    const signals = [
      navigator.userAgent,
      navigator.language,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      `${screen.width}x${screen.height}x${screen.colorDepth}`,
      String(navigator.hardwareConcurrency ?? ""),
      String((navigator as { deviceMemory?: number }).deviceMemory ?? ""),
      navigator.platform ?? "",
    ].join("|");
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(signals));
    return [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 32);
  } catch {
    return undefined; // older browsers / blocked APIs — fingerprint is optional
  }
}
