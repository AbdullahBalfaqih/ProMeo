import "dotenv/config";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
if (process.env.NODE_ENV === "production") {
  console.error("refusing to reset a production database");
  process.exit(1);
}

async function main() {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("CREATE SCHEMA public");
  // drizzle-kit keeps its applied-migrations ledger in its own schema; dropping
  // only `public` would make the migrator skip everything.
  await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
  await pool.end();
  console.log("schema dropped; run npm run db:migrate");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
