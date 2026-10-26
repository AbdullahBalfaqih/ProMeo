import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export type TokenKind = "user" | "agent";

export interface GeneratedToken {
  /** Full token, shown to the caller exactly once. */
  token: string;
  /** Public prefix used for O(1) lookup. */
  prefix: string;
  /** sha256(secret) stored in the database. */
  secretHash: string;
}

/**
 * Tokens look like `apn_u_<12 hex prefix>_<43 char base64url secret>`.
 * Only the prefix and a hash of the secret are persisted.
 */
export function generateToken(kind: TokenKind): GeneratedToken {
  const prefix = randomBytes(6).toString("hex");
  const secret = randomBytes(32).toString("base64url");
  const marker = kind === "user" ? "u" : "a";
  return {
    token: `apn_${marker}_${prefix}_${secret}`,
    prefix,
    secretHash: sha256Hex(secret),
  };
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function hashEquals(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function parseToken(token: string): { kind: TokenKind; prefix: string; secret: string } | null {
  const m = /^apn_([ua])_([0-9a-f]{12})_([A-Za-z0-9_-]{20,})$/.exec(token);
  if (!m) return null;
  return { kind: m[1] === "u" ? "user" : "agent", prefix: m[2]!, secret: m[3]! };
}

/** HMAC-SHA256 hex, used for webhook signatures. */
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const { createHmac } = await import("node:crypto");
  return createHmac("sha256", secret).update(message, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Envelope encryption for webhook secrets at rest
// ---------------------------------------------------------------------------

const ALGO = "aes-256-gcm";

export function sealSecret(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) throw new Error("SECRET_ENCRYPTION_KEY must be 32 bytes");
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${ct.toString("base64url")}.${tag.toString("base64url")}`;
}

export function openSecret(sealed: string, keyHex: string): string {
  const [version, ivB64, ctB64, tagB64] = sealed.split(".");
  if (version !== "v1" || !ivB64 || !ctB64 || !tagB64) throw new Error("malformed sealed secret");
  const key = Buffer.from(keyHex, "hex");
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64url")), decipher.final()]).toString("utf8");
}
