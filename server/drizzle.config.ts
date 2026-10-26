import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://apn:apn_dev_password@127.0.0.1:5432/apn",
  },
  strict: true,
  verbose: true,
});
