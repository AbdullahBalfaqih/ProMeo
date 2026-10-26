/**
 * MUSD is an 18-decimal ERC-20 (verified on-chain 2026-10-17, see
 * docs/MEZO_INTEGRATION.md). All amounts in the API and database are integer
 * strings in base units. This module is the only place that formats them for
 * humans or parses human input.
 */
export const MUSD_DECIMALS = 18;
export const MUSD_SYMBOL = "MUSD";

const DECIMAL = /^(0|[1-9][0-9]*)(\.([0-9]{1,18}))?$/;

/** Parse a human decimal string ("12.5") into base units. Rejects negatives. */
export function parseMusd(input: string): bigint {
  const s = input.trim();
  if (!DECIMAL.test(s)) throw new Error(`invalid MUSD amount: ${input}`);
  const [whole, frac = ""] = s.split(".");
  const padded = (frac + "0".repeat(MUSD_DECIMALS)).slice(0, MUSD_DECIMALS);
  return BigInt(whole ?? "0") * 10n ** BigInt(MUSD_DECIMALS) + BigInt(padded || "0");
}

/** Format base units as an exact decimal string (no rounding, no exponent). */
export function formatMusd(amount: bigint): string {
  if (amount < 0n) throw new Error("negative amount");
  const base = 10n ** BigInt(MUSD_DECIMALS);
  const whole = amount / base;
  const frac = (amount % base).toString().padStart(MUSD_DECIMALS, "0").replace(/0+$/, "");
  return frac.length > 0 ? `${whole}.${frac}` : whole.toString();
}

/** Basis-points helper with bigint math; `bps` is an integer 0..10_000. */
export function applyBps(amount: bigint, bps: number): bigint {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) throw new Error("invalid bps");
  return (amount * BigInt(bps)) / 10_000n;
}

/** Parse a decimal integer string from the database. */
export function dbAmount(value: string | number | bigint): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("unsafe numeric amount in database");
    return BigInt(value);
  }
  if (!/^[0-9]+$/.test(value)) throw new Error(`invalid database amount: ${value}`);
  return BigInt(value);
}

export const toDbAmount = (v: bigint): string => v.toString();
