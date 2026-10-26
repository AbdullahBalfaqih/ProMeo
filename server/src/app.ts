import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Config } from "./config.js";
import type { Database } from "./db/client.js";
import { authenticate } from "./auth/service.js";
import { AppError } from "./lib/errors.js";
import { registerIdentityRoutes } from "./routes/identity.js";
import { registerMarketRoutes } from "./routes/market.js";
import { registerRequestRoutes } from "./routes/requests.js";
import { registerAgreementRoutes } from "./routes/agreements.js";
import { registerSystemRoutes } from "./routes/system.js";

const PUBLIC_ROUTES = new Set(["/healthz", "/v1/meta", "/v1/bootstrap/status", "/v1/bootstrap", "/v1/auth/wallet"]);

export async function buildApp(db: Database, config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: ["req.headers.authorization", "req.headers['x-api-key']", "body.password", "body.secret"],
    },
    bodyLimit: 1024 * 1024,
    trustProxy: true,
  });

  app.decorate("config", config);

  await app.register(cors, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    allowedHeaders: ["authorization", "content-type", "idempotency-key", "x-request-id"],
    exposedHeaders: ["x-request-id", "idempotent-replay", "retry-after"],
  });

  await app.register(rateLimit, {
    global: true,
    max: config.RATE_LIMIT_PER_MINUTE,
    timeWindow: 60_000,
    keyGenerator: (req) => {
      const auth = req.headers.authorization;
      if (typeof auth === "string" && auth.startsWith("Bearer ")) {
        // Rate limit per credential, not per IP behind a shared NAT.
        return `cred:${auth.slice(7, 30)}`;
      }
      return `ip:${req.ip}`;
    },
    errorResponseBuilder: (_req, ctx) => ({
      error: { code: "rate_limited", message: `Rate limit exceeded, retry in ${Math.ceil(ctx.ttl / 1000)}s` },
    }),
  });

  app.addHook("onRequest", async (req, reply) => {
    const requestId = (req.headers["x-request-id"] as string) || randomUUID();
    req.requestId = requestId;
    reply.header("x-request-id", requestId);

    if (req.method === "OPTIONS") return;
    const path = req.url.split("?")[0] ?? req.url;
    if (PUBLIC_ROUTES.has(path)) return;
    if (!path.startsWith("/v1/") && path !== "/healthz") return;

    req.principal = await authenticate(db, req);
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.status).send({
        error: {
          code: err.code,
          message: err.message,
          ...(err.details !== undefined ? { details: err.details } : {}),
          requestId: req.requestId,
        },
      });
    }
    const anyErr = err as { validation?: unknown; statusCode?: number; message?: string; code?: string; name?: string };
    if (anyErr.validation) {
      return reply.status(400).send({
        error: { code: "invalid_request", message: "Request validation failed", details: anyErr.validation, requestId: req.requestId },
      });
    }
    if (anyErr.code === "23505") {
      return reply.status(409).send({
        error: { code: "conflict", message: "Resource already exists", requestId: req.requestId },
      });
    }
    if (anyErr.code === "23503") {
      return reply.status(409).send({
        error: { code: "conflict", message: "Referenced resource does not exist", requestId: req.requestId },
      });
    }
    if (anyErr.name === "PolicyValidationError" || anyErr.name === "ZodError") {
      return reply.status(400).send({
        error: { code: "invalid_policy", message: anyErr.message, requestId: req.requestId },
      });
    }
    if (anyErr.statusCode && anyErr.statusCode < 500) {
      return reply.status(anyErr.statusCode).send({
        error: { code: "invalid_request", message: anyErr.message ?? "Bad request", requestId: req.requestId },
      });
    }
    req.log.error({ err }, "unhandled error");
    return reply.status(500).send({
      error: { code: "internal_error", message: "Internal server error", requestId: req.requestId },
    });
  });

  // The operator console is a dependency-free single page served by the API
  // itself on `/`, `/admin`, and `/console`. It talks to the same origin, so
  // no CORS surface is added.
  const adminHtmlPath = fileURLToPath(new URL("../public/admin/index.html", import.meta.url));
  const sitePublicDir = fileURLToPath(new URL("../../public", import.meta.url));
  const serveConsole = (_req: unknown, reply: import("fastify").FastifyReply) => {
    const html = readFileSync(adminHtmlPath, "utf8");
    reply
      .header("content-type", "text/html; charset=utf-8")
      .header(
        "content-security-policy",
        "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src 'self' data:; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors *",
      )
      .header("x-content-type-options", "nosniff")
      .header("referrer-policy", "no-referrer")
      .send(html);
  };
  app.get("/", serveConsole);
  app.get("/admin", serveConsole);
  app.get("/console", serveConsole);

  // Serve shared ProMeo brand assets (/assets/*, /fonts/*) when the console is
  // opened directly on port 4000 as well as through Next.js on port 3000.
  const MIME_BY_EXT: Record<string, string> = {
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".woff2": "font/woff2",
    ".css": "text/css; charset=utf-8",
  };
  const serveBrandStatic = (req: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply) => {
    const rawPath = (req.url.split("?")[0] ?? "").replace(/^\/+/, "");
    if (!rawPath || rawPath.includes("..") || (!rawPath.startsWith("assets/") && !rawPath.startsWith("fonts/"))) {
      return reply.status(404).send({ error: { code: "not_found", message: "Asset not found" } });
    }
    const fullPath = `${sitePublicDir}/${rawPath}`;
    try {
      const buf = readFileSync(fullPath);
      const ext = rawPath.slice(rawPath.lastIndexOf(".")).toLowerCase();
      reply
        .header("content-type", MIME_BY_EXT[ext] ?? "application/octet-stream")
        .header("cache-control", "public, max-age=3600")
        .send(buf);
    } catch {
      reply.status(404).send({ error: { code: "not_found", message: "Asset not found" } });
    }
  };
  app.get("/assets/*", serveBrandStatic);
  app.get("/fonts/*", serveBrandStatic);

  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send({
      error: { code: "not_found", message: `Route ${req.method} ${req.url} not found`, requestId: req.requestId },
    });
  });

  registerSystemRoutes(app, db, config);
  registerIdentityRoutes(app, db, config);
  registerMarketRoutes(app, db, config);
  registerRequestRoutes(app, db, config);
  registerAgreementRoutes(app, db, config);

  return app;
}
