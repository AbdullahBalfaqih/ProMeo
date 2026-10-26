import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

import { fileURLToPath } from "node:url";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

async function main() {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });
  await pool.end();
  console.log("migrations applied");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
