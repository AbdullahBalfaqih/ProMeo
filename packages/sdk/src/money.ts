/** MUSD has 18 decimals. All protocol amounts are integer strings in base units. */
export const MUSD_DECIMALS = 18;

export function parseMusd(input: string): bigint {
  const s = input.trim();
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,18})?$/.test(s)) throw new Error(`invalid MUSD amount: ${input}`);
  const [whole = "0", frac = ""] = s.split(".");
  const padded = (frac + "0".repeat(MUSD_DECIMALS)).slice(0, MUSD_DECIMALS);
  return BigInt(whole) * 10n ** BigInt(MUSD_DECIMALS) + BigInt(padded || "0");
}

export function formatMusd(amount: bigint): string {
  if (amount < 0n) throw new Error("negative amount");
  const base = 10n ** BigInt(MUSD_DECIMALS);
  const whole = amount / base;
  const frac = (amount % base).toString().padStart(MUSD_DECIMALS, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

export function applyBps(amount: bigint, bps: number): bigint {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) throw new Error("invalid bps");
  return (amount * BigInt(bps)) / 10_000n;
}
