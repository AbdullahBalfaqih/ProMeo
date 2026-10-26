/** HMAC verification helper for webhook consumers. Mirrors the server signer. */
export async function verifyWebhookSignature(params: {
  secret: string;
  body: string;
  signatureHeader: string;
  timestampHeader: string;
  toleranceSeconds?: number;
  nowSeconds?: number;
}): Promise<boolean> {
  const ts = Number(params.timestampHeader);
  const now = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > (params.toleranceSeconds ?? 300)) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(params.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}.${params.body}`));
  const expected = "v1=" + [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");

  if (expected.length !== params.signatureHeader.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ params.signatureHeader.charCodeAt(i);
  return diff === 0;
}
