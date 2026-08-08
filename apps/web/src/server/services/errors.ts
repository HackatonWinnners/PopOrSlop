/** Typed domain errors; the tRPC layer maps codes to client-facing errors. */
export type DomainErrorCode =
  | "INSUFFICIENT_BALANCE"
  | "POSITION_CAP"
  | "MARKET_CLOSED"
  | "MARKET_NOT_FOUND"
  | "PRICE_MOVED"
  | "CANNOT_SHORT"
  | "BAD_STATE"
  | "NOT_AUTHORIZED"
  | "CONCURRENT_UPDATE";

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "DomainError";
  }
}
