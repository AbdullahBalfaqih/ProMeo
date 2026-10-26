import type { Config } from "./config.js";
import type { Permission } from "./auth/rbac.js";

export type Principal =
  | {
      kind: "user";
      orgId: string;
      userId: string;
      role: string;
      apiKeyId: string;
      permissions: ReadonlySet<Permission>;
    }
  | {
      kind: "agent";
      orgId: string;
      agentId: string;
      credentialId: string;
      trustLevel: number;
      walletAddress: string;
      scopes: ReadonlySet<string>;
    };

declare module "fastify" {
  interface FastifyRequest {
    principal?: Principal;
    requestId: string;
  }
  interface FastifyInstance {
    config: Config;
  }
}

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}
