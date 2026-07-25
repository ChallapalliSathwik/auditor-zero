import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
    // Set before any module (notably src/db) is imported, so every test file gets
    // its own isolated in-memory database and the secrets the ledger/auth need.
    // This makes `npm test` deterministic and repeatable in CI with no disk writes.
    env: {
      DATABASE_PATH: ":memory:",
      JWT_SECRET: "test-jwt-secret",
      LEDGER_SECRET: "test-ledger-secret",
    },
  },
});
