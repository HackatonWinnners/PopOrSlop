/** µpts → display points, e.g. 1234500000n → "1,234.5". */
export function fmtPts(micro: bigint | null | undefined, digits = 1): string {
  if (micro === null || micro === undefined) return "—";
  const neg = micro < 0n;
  const abs = neg ? -micro : micro;
  const whole = abs / 1_000_000n;
  const frac = abs % 1_000_000n;
  const fracStr = digits > 0 ? "." + (Number(frac) / 1_000_000).toFixed(digits).slice(2) : "";
  return `${neg ? "−" : ""}${whole.toLocaleString("en-US")}${fracStr}`;
}

/** µprob (0..1e6) → "45.3%". */
export function fmtProb(micro: number | null | undefined, digits = 1): string {
  if (micro === null || micro === undefined) return "—";
  return `${(micro / 10_000).toFixed(digits)}%`;
}

/** µshares → whole-share display. */
export function fmtShares(micro: bigint, digits = 1): string {
  return fmtPts(micro, digits);
}

export function fmtTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
