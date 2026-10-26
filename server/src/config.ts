import { z } from "zod";

/**
 * Runtime configuration. Every secret is read from the environment; nothing is
 * committed. `loadConfig` fails fast and loudly rather than falling back to a
 * development default that could leak into production.
 */
const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? def : v === "true" || v === "1"));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

  /** Base URL advertised in the OpenAPI spec and used in webhook payloads. */
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:4000"),

  /** Optional CORS allowlist, comma separated. Empty means same-origin only. */
  CORS_ORIGINS: z.string().default(""),

  /** Rate limiting: requests per minute per credential. */
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(240),

  // --- Chain integration -------------------------------------------------
  MEZO_CHAIN_ID: z.coerce.number().int().positive().default(31611),
  MEZO_RPC_URL: z.string().url().default("https://rpc.test.mezo.org"),
  MEZO_EXPLORER_URL: z.string().url().default("https://explorer.test.mezo.org"),
  /** Address of the ProcurementEscrow actually deployed on MEZO_CHAIN_ID. */
  ESCROW_CONTRACT_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
  /** Address of the AgentPolicyRegistry deployed on MEZO_CHAIN_ID. */
  REGISTRY_CONTRACT_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
  /** MUSD token for the configured chain; must match what the operator verified. */
  MUSD_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
  /** Number of confirmations before an escrow event is projected into Postgres. */
  INDEXER_CONFIRMATIONS: z.coerce.number().int().min(0).max(64).default(3),
  INDEXER_POLL_MS: z.coerce.number().int().positive().default(5000),
  INDEXER_BLOCK_CHUNK: z.coerce.number().int().positive().max(10_000).default(2000),
  INDEXER_ENABLED: bool(false),
  /** Optional resolver key. Only used for dispute resolutions; never for funding. */
  RESOLVER_PRIVATE_KEY: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
  /** Buyer-side executor key: signs approve/fund/release/cancel/dispute transactions.
   *  Required on any remote chain (e.g. Mezo testnet); the well-known Anvil key is
   *  used only when the RPC is a local development node and this is unset. */
  BUYER_PRIVATE_KEY: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
  /** Vendor-side executor key: signs accept/submitDelivery transactions.
   *  Required on any remote chain; the well-known Anvil key is used only locally. */
  VENDOR_PRIVATE_KEY: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),

  /** 32-byte hex key used to seal webhook signing secrets at rest (AES-256-GCM).
   *  Required to create webhook endpoints; rotate with care (re-seal needed). */
  SECRET_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),

  // --- Webhooks ----------------------------------------------------------
  WEBHOOK_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  WEBHOOK_MAX_ATTEMPTS: z.coerce.number().int().positive().default(8),
  WEBHOOK_WORKER_ENABLED: bool(false),

  /** Platform-operator credential for actions that no tenant may perform on
   *  itself (e.g. verifying a vendor). Sent as `x-operator-token`. Optional:
   *  without it, vendor verification must be done directly in the database. */
  OPERATOR_TOKEN: z.string().min(24).optional(),

  /** When true, bootstrap endpoints are served (local demo only). */
  ALLOW_BOOTSTRAP: bool(false),
});

export type Config = z.infer<typeof schema> & { corsOrigins: string[] };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid configuration: ${details}`);
  }
  const cfg = parsed.data;

  if (cfg.NODE_ENV === "production") {
    if (cfg.ALLOW_BOOTSTRAP) throw new Error("ALLOW_BOOTSTRAP must be false in production");
    if (cfg.ESCROW_CONTRACT_ADDRESS && !cfg.MUSD_ADDRESS) {
      throw new Error("MUSD_ADDRESS must be set when ESCROW_CONTRACT_ADDRESS is configured");
    }
    if (cfg.CORS_ORIGINS.trim() === "*") {
      throw new Error("Wildcard CORS is not allowed in production");
    }
  }

  const corsOrigins = cfg.CORS_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return { ...cfg, corsOrigins };
}
