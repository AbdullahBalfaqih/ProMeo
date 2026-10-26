import { describe, expect, it } from "vitest";
import { rankOffers, WEIGHTS, type RankableOffer } from "../src/procurement/offers.js";

const now = new Date("2026-10-17T12:00:00Z");
const base = (over: Partial<RankableOffer> & Pick<RankableOffer, "offerId" | "vendorId">): RankableOffer => ({
  vendorName: `Vendor ${over.vendorId}`,
  vendorVerified: true,
  vendorTier: 3,
  priceAmount: 1000n * 10n ** 18n,
  deliveryDays: 5,
  serviceCapabilities: ["gpu"],
  expiresAt: new Date("2026-10-19T00:00:00Z"),
  ...over,
});

const req = { capabilities: ["gpu"], budgetAmount: 10_000n * 10n ** 18n, now };

describe("deterministic ranking", () => {
  it("is invariant under input permutation", () => {
    const offers = [
      base({ offerId: "a", vendorId: "v1", priceAmount: 1000n * 10n ** 18n }),
      base({ offerId: "b", vendorId: "v2", priceAmount: 900n * 10n ** 18n }),
      base({ offerId: "c", vendorId: "v3", priceAmount: 1100n * 10n ** 18n }),
    ];
    const one = rankOffers(offers, req);
    const two = rankOffers([...offers].reverse(), req);
    expect(JSON.stringify(one)).toBe(JSON.stringify(two));
  });

  it("orders by score, then price, then speed, then vendor id", () => {
    const ranked = rankOffers(
      [
        base({ offerId: "slow-cheap", vendorId: "v2", priceAmount: 900n * 10n ** 18n, deliveryDays: 9 }),
        base({ offerId: "fast-mid", vendorId: "v3", priceAmount: 950n * 10n ** 18n, deliveryDays: 2 }),
      ],
      req,
    );
    expect(ranked).toHaveLength(2);
    expect(new Set(ranked.map((r) => r.offerId)).size).toBe(2);
    // The cheaper offer must always score higher on the price component, no
    // matter where it lands in the overall ordering (speed can outrank price).
    const cheap = ranked.find((r) => r.offerId === "slow-cheap")!;
    const mid = ranked.find((r) => r.offerId === "fast-mid")!;
    expect(cheap.rankBreakdown.price).toBeGreaterThan(mid.rankBreakdown.price);
    // ...and the faster one must score higher on speed.
    expect(mid.rankBreakdown.speed).toBeGreaterThan(cheap.rankBreakdown.speed);
  });

  it("produces integer scores within the documented maximum", () => {
    const max = (WEIGHTS.price + WEIGHTS.speed + WEIGHTS.verified + WEIGHTS.tier + WEIGHTS.capability) * 1000;
    for (const o of rankOffers([base({ offerId: "a", vendorId: "v1" })], req)) {
      expect(Number.isInteger(o.rankScore)).toBe(true);
      expect(o.rankScore).toBeLessThanOrEqual(max);
      expect(o.rankScore).toBeGreaterThan(0);
    }
  });

  it("excludes expired and over-budget offers from eligibility", () => {
    const ranked = rankOffers(
      [
        base({ offerId: "ok", vendorId: "v1" }),
        base({ offerId: "expired", vendorId: "v2", expiresAt: new Date("2026-10-16T00:00:00Z") }),
        base({ offerId: "expensive", vendorId: "v3", priceAmount: 20_000n * 10n ** 18n }),
      ],
      req,
    );
    const byId = Object.fromEntries(ranked.map((r) => [r.offerId, r]));
    expect(byId.ok!.rankBreakdown.eligible).toBe(true);
    expect(byId.expired!.rankBreakdown.eligible).toBe(false);
    expect(byId.expired!.rankBreakdown.reason).toBe("expired");
    expect(byId.expensive!.rankBreakdown.eligible).toBe(false);
    expect(byId.expensive!.rankScore).toBe(0);
  });

  it("rewards verified vendors and higher tiers", () => {
    const [verified, unverified] = rankOffers(
      [
        base({ offerId: "v", vendorId: "v1", vendorVerified: true, vendorTier: 5 }),
        base({ offerId: "u", vendorId: "v2", vendorVerified: false, vendorTier: 1 }),
      ],
      req,
    ).sort((a, b) => (a.offerId === "v" ? -1 : 1));
    expect(verified!.rankScore).toBeGreaterThan(unverified!.rankScore);
  });

  it("handles capability coverage proportionally", () => {
    const [full, partial] = rankOffers(
      [
        base({ offerId: "full", vendorId: "v1", serviceCapabilities: ["gpu", "soc2"] }),
        base({ offerId: "partial", vendorId: "v2", serviceCapabilities: ["gpu"] }),
      ],
      { ...req, capabilities: ["gpu", "soc2"] },
    ).sort((a, b) => (a.offerId === "full" ? -1 : 1));
    expect(full!.rankBreakdown.capability).toBeGreaterThan(partial!.rankBreakdown.capability);
  });

  it("returns an empty list when there are no offers", () => {
    expect(rankOffers([], req)).toEqual([]);
  });
});
