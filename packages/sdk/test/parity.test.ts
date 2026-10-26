import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { verifyWebhookSignature } from "../src/webhooks.js";
import { canonicalHash, canonicalize, DOMAINS } from "../src/canonical.js";
import { formatMusd, parseMusd } from "../src/money.js";
import { hashOffer, offerTypedData, verifyOfferSignature } from "../src/offers.js";

const vectors = JSON.parse(
  readFileSync(new URL("../../../spec/hash-vectors.json", import.meta.url), "utf8"),
) as {
  canonical: Array<{ name: string; input: unknown; canonical: string }>;
  hashes: Array<{ name: string; domain: string; input: unknown; hash: string }>;
};

describe("SDK ↔ spec parity", () => {
  for (const v of vectors.canonical) {
    it(`canonicalizes like the spec: ${v.name}`, () => {
      expect(canonicalize(v.input)).toBe(v.canonical);
    });
  }
  for (const v of vectors.hashes) {
    it(`hashes like the spec: ${v.name}`, () => {
      expect(canonicalHash(v.domain, v.input)).toBe(v.hash);
    });
  }
});

describe("money", () => {
  it("round-trips decimal strings", () => {
    expect(parseMusd("1200").toString()).toBe("1200000000000000000000");
    expect(parseMusd("0.000000000000000001")).toBe(1n);
    expect(formatMusd(1200n * 10n ** 18n)).toBe("1200");
    expect(formatMusd(1n)).toBe("0.000000000000000001");
  });
  it("rejects malformed input", () => {
    expect(() => parseMusd("-1")).toThrow();
    expect(() => parseMusd("1.1234567890123456789")).toThrow();
    expect(() => parseMusd("1e18")).toThrow();
  });
});

describe("offer signing", () => {
  const payload = {
    requestId: "0f9c2b7e-0000-4000-8000-000000000001",
    vendorId: "0f9c2b7e-0000-4000-8000-000000000002",
    vendorWallet: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    serviceId: null,
    priceAmount: "400000000000000000000",
    currency: "MUSD" as const,
    deliveryDays: 2,
    terms: { slaHours: 24 },
    expiresAt: "2026-10-19T12:00:00.000Z",
    nonce: "nonce-1",
  };

  it("hashes deterministically regardless of key order", () => {
    const reordered = Object.fromEntries(Object.entries(payload).reverse()) as typeof payload;
    expect(hashOffer(payload)).toBe(hashOffer(reordered));
  });

  it("matches the typed-data offer hash and verifies a real signature", async () => {
    const { privateKeyToAccount } = await import("viem/accounts");
    const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
    const hash = hashOffer(payload);
    const typed = offerTypedData({
      chainId: 31611,
      verifyingContract: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
      requestId: payload.requestId,
      offerHash: hash,
      vendor: account.address,
      priceAmount: BigInt(payload.priceAmount),
      expiresAt: Math.floor(new Date(payload.expiresAt).getTime() / 1000),
    });

    const signature = await account.signTypedData({
      domain: typed.domain,
      types: typed.types,
      primaryType: "Offer",
      message: typed.message,
    });

    expect(
      await verifyOfferSignature({
        chainId: 31611,
        verifyingContract: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
        signature,
        signer: account.address,
        requestId: payload.requestId,
        offerHash: hash,
        priceAmount: BigInt(payload.priceAmount),
        expiresAt: Math.floor(new Date(payload.expiresAt).getTime() / 1000),
      }),
    ).toBe(true);
  });
});

describe("webhook verification", () => {
  it("accepts a correct HMAC and rejects tampering", async () => {
    const secret = "a".repeat(64);
    const body = JSON.stringify({ hello: "world" });
    const ts = 1_800_000_000;
    const sig = "v1=" + createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");

    expect(
      await verifyWebhookSignature({
        secret,
        body,
        signatureHeader: sig,
        timestampHeader: String(ts),
        nowSeconds: ts,
      }),
    ).toBe(true);

    expect(
      await verifyWebhookSignature({
        secret,
        body: body + " ",
        signatureHeader: sig,
        timestampHeader: String(ts),
        nowSeconds: ts,
      }),
    ).toBe(false);

    expect(
      await verifyWebhookSignature({
        secret,
        body,
        signatureHeader: sig,
        timestampHeader: String(ts),
        nowSeconds: ts + 10_000,
      }),
    ).toBe(false);
  });
});

describe("client", () => {
  it("maps API errors to ApnError", async () => {
    const { ApnClient, ApnError } = await import("../src/client.js");
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ error: { code: "policy_denied", message: "nope", requestId: "r1" } }), {
        status: 403,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;

    const client = new ApnClient({ baseUrl: "https://api.example", token: "apn_u_x", fetch: fakeFetch });
    await expect(client.requests.publish("id")).rejects.toBeInstanceOf(ApnError);
    try {
      await client.requests.publish("id");
    } catch (err) {
      expect((err as InstanceType<typeof ApnError>).status).toBe(403);
      expect((err as InstanceType<typeof ApnError>).code).toBe("policy_denied");
      expect((err as InstanceType<typeof ApnError>).requestId).toBe("r1");
    }
  });

  it("sends auth and idempotency headers", async () => {
    const { ApnClient } = await import("../src/client.js");
    let seen: RequestInit | undefined;
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      seen = init;
      return new Response(JSON.stringify({ request: { id: "x" } }), { status: 201 });
    }) as unknown as typeof fetch;

    const client = new ApnClient({ baseUrl: "https://api.example", token: "apn_u_test", fetch: fakeFetch });
    await client.requests.create(
      { title: "t", description: "d", category: "software", budgetAmount: "10" },
      "idem-key-123",
    );
    const headers = seen?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer apn_u_test");
    expect(headers["idempotency-key"]).toBe("idem-key-123");
  });
});
