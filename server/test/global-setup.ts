import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const TEST_URL = process.env.TEST_DATABASE_URL ?? "postgresql://apn:apn_dev_password@127.0.0.1:5432/apn_test";

/** Applies migrations once per test run. */
export default async function setup() {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? TEST_URL;
  const pool = new pg.Pool({ connectionString: TEST_URL, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
  } finally {
    await pool.end();
  }
}
