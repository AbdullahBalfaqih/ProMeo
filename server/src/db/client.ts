import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

export type Database = NodePgDatabase<typeof schema>;

export interface DbHandle {
  db: Database;
  pool: pg.Pool;
  close: () => Promise<void>;
}

export function createDb(databaseUrl: string, max = 10): DbHandle {
  const pool = new pg.Pool({ connectionString: databaseUrl, max, idleTimeoutMillis: 30_000 });
  // Fail fast on bad credentials instead of hanging the first request.
  pool.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error("postgres pool error", err.message);
  });
  const db = drizzle(pool, { schema });
  return {
    db,
    pool,
    close: async () => {
      await pool.end();
    },
  };
}

export { schema };
