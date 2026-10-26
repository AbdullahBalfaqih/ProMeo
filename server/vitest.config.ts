import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    // The API tests share one PostgreSQL schema; run files sequentially.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://apn:apn_dev_password@127.0.0.1:5432/apn_test",
      LOG_LEVEL: "error",
      MEZO_CHAIN_ID: "31611",
      MEZO_RPC_URL: "http://127.0.0.1:8545",
      MEZO_EXPLORER_URL: "https://explorer.test.mezo.org",
      ESCROW_CONTRACT_ADDRESS: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
      REGISTRY_CONTRACT_ADDRESS: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
      MUSD_ADDRESS: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
      SECRET_ENCRYPTION_KEY: "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
      ALLOW_BOOTSTRAP: "true",
      RATE_LIMIT_PER_MINUTE: "10000",
    },
  },
});
