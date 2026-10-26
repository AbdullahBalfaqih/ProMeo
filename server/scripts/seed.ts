import "dotenv/config";
import { writeFileSync } from "node:fs";
import { and, eq, inArray } from "drizzle-orm";
import { privateKeyToAccount } from "viem/accounts";
import { loadConfig } from "../src/config.js";
import { createDb } from "../src/db/client.js";
import {
  agentBudgets,
  agentCredentials,
  agents,
  apiKeys,
  organizations,
  users,
  vendorServices,
  vendors,
  webhookEndpoints,
} from "../src/db/schema.js";
import { generateToken, sealSecret, sha256Hex } from "../src/lib/crypto.js";
import { createPolicyVersion, activatePolicy } from "../src/policy/service.js";
import { defaultPolicyDocument } from "../src/policy/defaults.js";
import { awardRequest, createRequest, publishRequest, submitOffer } from "../src/procurement/requests.js";
import { hashOffer, offerTypedData } from "../src/procurement/offers.js";
import { createAgreementProposal, executeAgreementOnchain } from "../src/procurement/agreements.js";
import { deliverDue } from "../src/webhooks/service.js";
import type { Principal } from "../src/types.js";
import { USER_ROLE_PERMISSIONS } from "../src/auth/rbac.js";

const DEMO = {
  buyer: {
    name: "Northwind Robotics",
    slug: "northwind",
    email: "ops@northwind.example",
    userName: "Dana Ops",
    approverEmail: "cfo@northwind.example",
    walletAddress: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
  },
  vendor: {
    name: "Helios Compute",
    slug: "helios",
    email: "sales@helios.example",
    userName: "Sam Sales",
    walletAddress: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
  },
  agentWallet: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  payoutWallet: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  vendorPk: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const,
};

type Credential = { org: string; role: string; token: string };

export async function seed(db: ReturnType<typeof createDb>["db"], opts: { rotate?: boolean } = {}) {
  const config = loadConfig();
  const issued: Credential[] = [];

  if (opts.rotate) {
    await db
      .delete(organizations)
      .where(inArray(organizations.slug, [DEMO.buyer.slug, DEMO.vendor.slug]));
  }

  let buyerOrgId = "";
  let buyerOwnerId = "";
  let buyerAgentId = "";
  let vendorOrgId = "";
  let vendorOwnerId = "";
  let heliosVendorId = "";
  let h100ServiceId = "";
  let inferenceServiceId = "";

  for (const spec of [DEMO.buyer, DEMO.vendor]) {
    const [existing] = await db.select().from(organizations).where(eq(organizations.slug, spec.slug)).limit(1);

    if (existing) {
      console.log(`• ${spec.slug}: already seeded — skipped (pass --rotate for fresh seed)`);
      continue;
    }

    const ownerToken = generateToken("user");
    const { org, owner } = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(organizations)
        .values({
          name: spec.name,
          slug: spec.slug,
          walletAddress: spec.walletAddress.toLowerCase(),
        })
        .returning();
      if (!created) throw new Error("org insert failed");
      const [user] = await tx
        .insert(users)
        .values({ orgId: created.id, email: spec.email, displayName: spec.userName, role: "owner" })
        .returning();
      if (!user) throw new Error("user insert failed");
      await tx.insert(apiKeys).values({
        orgId: created.id,
        userId: user.id,
        name: "Seed key",
        prefix: ownerToken.prefix,
        secretHash: ownerToken.secretHash,
        scopes: [],
      });
      const draft = await createPolicyVersion(tx as never, created.id, defaultPolicyDocument(), user.id);
      await activatePolicy(tx as never, created.id, draft.id, user.id);
      return { org: created, owner: user };
    });

    issued.push({ org: spec.slug, role: "owner", token: ownerToken.token });
    console.log(`• ${spec.slug}: organization created`);

    if (spec.slug === DEMO.buyer.slug) {
      buyerOrgId = org.id;
      buyerOwnerId = owner.id;

      const approverToken = generateToken("user");
      await db.transaction(async (tx) => {
        const [approver] = await tx
          .insert(users)
          .values({
            orgId: org.id,
            email: DEMO.buyer.approverEmail,
            displayName: "Avery Finance",
            role: "approver",
          })
          .returning();
        if (!approver) throw new Error("approver insert failed");
        await tx.insert(apiKeys).values({
          orgId: org.id,
          userId: approver.id,
          name: "Seed approver key",
          prefix: approverToken.prefix,
          secretHash: approverToken.secretHash,
          scopes: [],
        });
      });
      issued.push({ org: spec.slug, role: "approver", token: approverToken.token });

      const agentToken = generateToken("agent");
      await db.transaction(async (tx) => {
        const [agent] = await tx
          .insert(agents)
          .values({
            orgId: org.id,
            name: "Sourcing Agent Alpha",
            description: "Autonomous compute procurement agent with bounded daily and per-request limits.",
            walletAddress: DEMO.agentWallet.toLowerCase(),
            scopes: ["request:create", "request:read", "offer:read", "offer:discover", "budget:read"],
            trustLevel: 2,
            createdByUserId: owner.id,
          })
          .returning();
        if (!agent) throw new Error("agent insert failed");
        buyerAgentId = agent.id;

        await tx.insert(agentCredentials).values({
          agentId: agent.id,
          orgId: org.id,
          prefix: agentToken.prefix,
          secretHash: agentToken.secretHash,
          label: "Primary Agent Credential",
          expiresAt: new Date(Date.now() + 90 * 86400_000),
        });

        const now = new Date();
        const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        await tx.insert(agentBudgets).values([
          {
            orgId: org.id,
            agentId: agent.id,
            window: "daily",
            limitAmount: (5000n * 10n ** 18n).toString(),
            periodStart: dayStart,
            periodEnd: new Date(dayStart.getTime() + 86400_000),
          },
          {
            orgId: org.id,
            agentId: agent.id,
            window: "monthly",
            limitAmount: (20000n * 10n ** 18n).toString(),
            periodStart: monthStart,
            periodEnd: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
          },
          {
            orgId: org.id,
            agentId: agent.id,
            window: "per_request",
            limitAmount: (2500n * 10n ** 18n).toString(),
            periodStart: new Date(0),
            periodEnd: new Date(Date.UTC(9999, 0, 1)),
          },
        ]);
      });
      issued.push({ org: spec.slug, role: "agent", token: agentToken.token });
    }

    if (spec.slug === DEMO.vendor.slug) {
      vendorOrgId = org.id;
      vendorOwnerId = owner.id;

      await db.transaction(async (tx) => {
        const [vendor] = await tx
          .insert(vendors)
          .values({
            orgId: org.id,
            name: "Helios Compute",
            legalName: "Helios Compute Ltd",
            description: "Bare-metal compute capacity across European and North American regions.",
            payoutAddress: DEMO.payoutWallet.toLowerCase(),
            contactEmail: DEMO.vendor.email,
            status: "active",
            verified: true,
            tier: 3,
          })
          .returning();
        if (!vendor) throw new Error("vendor insert failed");
        heliosVendorId = vendor.id;

        const manifests = [
          {
            name: "Dedicated 8-Node Compute Cluster",
            category: "cloud_infrastructure",
            description: "Dedicated node with 8 high-memory compute accelerators and dual 10Gbps fabric.",
            capabilities: ["gpu", "h100", "kubernetes", "sla-99.9"],
            regions: ["eu-west", "us-east"],
            priceModel: "hourly" as const,
            basePrice: (24n * 10n ** 18n).toString(),
            slaHours: 4,
            manifest: {
              schema: "apn.service.v1",
              unit: "node-hour",
              minUnits: 24,
              commitment: "on_demand",
              dataResidency: ["eu-west", "us-east"],
            },
          },
          {
            name: "Managed Inference Cluster",
            category: "cloud_infrastructure",
            description: "Managed Kubernetes inference cluster with high-availability service guarantee.",
            capabilities: ["inference", "kubernetes", "soc2"],
            regions: ["eu-west"],
            priceModel: "hourly" as const,
            basePrice: (18n * 10n ** 18n).toString(),
            slaHours: 8,
            manifest: { schema: "apn.service.v1", unit: "cluster-hour", minUnits: 72, commitment: "reserved" },
          },
        ];

        const { canonicalHash, DOMAINS } = await import("../src/lib/canonical.js");
        const insertedServices = await tx
          .insert(vendorServices)
          .values(
            manifests.map((m) => ({
              vendorId: vendor.id,
              orgId: org.id,
              name: m.name,
              category: m.category,
              description: m.description,
              capabilities: m.capabilities,
              regions: m.regions,
              priceModel: m.priceModel,
              basePrice: m.basePrice,
              slaHours: m.slaHours,
              manifest: m.manifest,
              manifestHash: canonicalHash(DOMAINS.manifest, m as unknown as Record<string, unknown>),
            })),
          )
          .returning();
        h100ServiceId = insertedServices[0]?.id ?? "";
        inferenceServiceId = insertedServices[1]?.id ?? "";
      });
      console.log("• helios: vendor profile + 2 service manifests");
    }
  }

  if (buyerOrgId && vendorOrgId && heliosVendorId) {
    const buyerPrincipal: Principal = {
      kind: "user",
      orgId: buyerOrgId,
      userId: buyerOwnerId,
      role: "owner",
      apiKeyId: "00000000-0000-0000-0000-000000000000",
      permissions: USER_ROLE_PERMISSIONS.owner!,
    };
    const vendorPrincipal: Principal = {
      kind: "user",
      orgId: vendorOrgId,
      userId: vendorOwnerId,
      role: "owner",
      apiKeyId: "00000000-0000-0000-0000-000000000000",
      permissions: USER_ROLE_PERMISSIONS.owner!,
    };
    const vendorAccount = privateKeyToAccount(DEMO.vendorPk);

    // Webhook endpoint for Northwind Robotics
    if (config.SECRET_ENCRYPTION_KEY) {
      const whSecret = "whsec_northwind_live_secret_key_2026";
      await db.insert(webhookEndpoints).values({
        orgId: buyerOrgId,
        url: "http://127.0.0.1:4000/healthz",
        description: "Primary Procurement Event Telemetry",
        secretHash: sha256Hex(whSecret),
        secretSealed: sealSecret(whSecret, config.SECRET_ENCRYPTION_KEY),
        events: [
          "request.published",
          "offer.submitted",
          "approval.decided",
          "agreement.created",
          "escrow.funded",
          "escrow.released",
        ],
        active: true,
      });
    }

    const signAndSubmit = async (
      requestId: string,
      serviceId: string | undefined,
      priceMusd: bigint,
      deliveryDays: number,
      nonceTag: string,
    ) => {
      const priceAmount = (priceMusd * 10n ** 18n).toString();
      const expiresMs = Math.floor((Date.now() + 7 * 86400_000) / 1000) * 1000;
      const expiresAt = new Date(expiresMs).toISOString();
      const payload = {
        requestId,
        vendorId: heliosVendorId,
        vendorWallet: vendorAccount.address.toLowerCase(),
        serviceId: serviceId || null,
        priceAmount,
        currency: "MUSD" as const,
        deliveryDays,
        terms: { sla: "99.9%", region: "eu-west" },
        expiresAt,
        nonce: nonceTag,
      };
      const localHash = hashOffer(payload);
      const td = offerTypedData({
        chainId: config.MEZO_CHAIN_ID,
        verifyingContract: (config.ESCROW_CONTRACT_ADDRESS ?? "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0") as `0x${string}`,
        requestId,
        offerHash: localHash,
        vendor: vendorAccount.address,
        priceAmount: BigInt(priceAmount),
        expiresAt: Math.floor(expiresMs / 1000),
      });
      const signature = await vendorAccount.signTypedData(td as Parameters<typeof vendorAccount.signTypedData>[0]);
      return submitOffer(db, vendorPrincipal, requestId, {
        vendorId: heliosVendorId,
        serviceId: serviceId || undefined,
        priceAmount,
        deliveryDays,
        terms: payload.terms,
        expiresAt,
        nonce: nonceTag,
        offerHash: localHash,
        signature,
        signer: vendorAccount.address.toLowerCase(),
      });
    };

    // 1. Open Request with a real signed offer ready for discovery & award
    const req1 = await createRequest(db, buyerPrincipal, {
      title: "Dedicated Compute Node for Fine-Tuning Run",
      description: "Two-week dedicated node with European data residency and Kubernetes access.",
      category: "cloud_infrastructure",
      requirements: { capabilities: ["h100", "kubernetes"], region: "eu-west", durationHours: 336 },
      budgetAmount: (1200n * 10n ** 18n).toString(),
      deadlineAt: new Date(Date.now() + 12 * 86400_000).toISOString(),
    });
    await publishRequest(db, buyerPrincipal, req1.id);
    await signAndSubmit(req1.id, h100ServiceId, 780n, 2, "seed-offer-1");

    // 2. High-value Request -> Awarded -> Pending Human Approval Gate
    const req2 = await createRequest(db, buyerPrincipal, {
      title: "Managed Inference Cluster — Seasonal Capacity",
      description: "Reserved high-availability inference cluster with compliance attestation.",
      category: "cloud_infrastructure",
      requirements: { capabilities: ["inference", "soc2"], region: "eu-west" },
      budgetAmount: (4200n * 10n ** 18n).toString(),
      deadlineAt: new Date(Date.now() + 14 * 86400_000).toISOString(),
    });
    await publishRequest(db, buyerPrincipal, req2.id);
    const offer2 = await signAndSubmit(req2.id, inferenceServiceId, 3600n, 4, "seed-offer-2");
    await awardRequest(db, buyerPrincipal, req2.id, offer2.id);

    // 3. Approved Request -> On-Chain Escrow Agreement Funded, Accepted, and Delivered (ready to Release or Dispute)
    const req3 = await createRequest(db, buyerPrincipal, {
      title: "Dedicated European Kubernetes Compute Node",
      description: "Low-latency training node for robotics simulation workload.",
      category: "cloud_infrastructure",
      requirements: { capabilities: ["gpu", "kubernetes"], region: "eu-west" },
      budgetAmount: (500n * 10n ** 18n).toString(),
      deadlineAt: new Date(Date.now() + 10 * 86400_000).toISOString(),
    });
    await publishRequest(db, buyerPrincipal, req3.id);
    const offer3 = await signAndSubmit(req3.id, h100ServiceId, 480n, 2, "seed-offer-3");
    await awardRequest(db, buyerPrincipal, req3.id, offer3.id);

    // 4. Approved Request -> On-Chain Escrow Agreement Fully Released
    const req4 = await createRequest(db, buyerPrincipal, {
      title: "Model Evaluation Benchmark Pipeline",
      description: "Automated safety and latency validation run across regional endpoints.",
      category: "software",
      requirements: { capabilities: ["inference"], region: "eu-west" },
      budgetAmount: (480n * 10n ** 18n).toString(),
      deadlineAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
    });
    await publishRequest(db, buyerPrincipal, req4.id);
    const offer4 = await signAndSubmit(req4.id, inferenceServiceId, 440n, 1, "seed-offer-4");
    await awardRequest(db, buyerPrincipal, req4.id, offer4.id);

    // Execute real on-chain agreements if chain is reachable
    if (config.ESCROW_CONTRACT_ADDRESS) {
      try {
        const prop3 = await createAgreementProposal(db, config, buyerPrincipal, {
          requestId: req3.id,
          offerId: offer3.id,
        });
        await executeAgreementOnchain(db, config, buyerPrincipal, prop3.agreement.id, "fund");
        await executeAgreementOnchain(db, config, buyerPrincipal, prop3.agreement.id, "accept");
        await executeAgreementOnchain(db, config, buyerPrincipal, prop3.agreement.id, "deliver");

        const prop4 = await createAgreementProposal(db, config, buyerPrincipal, {
          requestId: req4.id,
          offerId: offer4.id,
        });
        await executeAgreementOnchain(db, config, buyerPrincipal, prop4.agreement.id, "fund");
        await executeAgreementOnchain(db, config, buyerPrincipal, prop4.agreement.id, "accept");
        await executeAgreementOnchain(db, config, buyerPrincipal, prop4.agreement.id, "deliver");
        await executeAgreementOnchain(db, config, buyerPrincipal, prop4.agreement.id, "release");
        console.log("• northwind: 2 on-chain escrow agreements executed on Mezo 31611");
      } catch (err) {
        console.warn("• on-chain seed skipped:", (err as Error).message);
      }
    }

    buyerAgentId;
  }

  if (issued.length > 0) {
    const map: Record<string, string> = {};
    for (const c of issued) {
      map[`${c.org}_${c.role}`] = c.token;
    }
    try {
      writeFileSync("/tmp/apn-seed.json", JSON.stringify(map, null, 2));
    } catch {
      // Ignore write error if /tmp is restricted
    }
    console.log("\nCredentials — shown once, only hashes are stored:\n");
    for (const c of issued) console.log(`  ${c.org.padEnd(10)} ${c.role.padEnd(9)} ${c.token}`);
    console.log("");
  } else {
    console.log("\nNothing to do.");
  }
  return issued;
}

async function main() {
  const config = loadConfig();
  const handle = createDb(config.DATABASE_URL, config.DATABASE_POOL_MAX);
  try {
    await seed(handle.db, { rotate: process.argv.includes("--rotate") });
  } finally {
    await handle.close();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
