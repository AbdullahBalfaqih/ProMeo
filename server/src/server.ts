import "dotenv/config";
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { buildApp } from "./app.js";

async function main() {
  const config = loadConfig();
  const { db, close } = createDb(config.DATABASE_URL, config.DATABASE_POOL_MAX);
  const app = await buildApp(db, config);

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    await close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ host: config.HOST, port: config.PORT });
  app.log.info(
    {
      port: config.PORT,
      chainId: config.MEZO_CHAIN_ID,
      escrowConfigured: Boolean(config.ESCROW_CONTRACT_ADDRESS),
      indexerEnabled: config.INDEXER_ENABLED,
    },
    "agent procurement network api ready",
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
