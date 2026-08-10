import "dotenv/config";
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Integration tests share one Postgres database — no parallel files.
    fileParallelism: false,
    env: {
      TEST: "1",
      // From your own .env — never hardcode a real one here, this file is
      // committed. Falls back to the docker-compose default.
      TEST_DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        "postgres://poporslop:poporslop@localhost:5433/poporslop_test",
      // Tests create fresh users; the 7-day cap is exercised explicitly, not ambiently.
      NEW_ACCOUNT_CAP_PTS: "1000000",
    },
    testTimeout: 60_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "~": path.resolve(import.meta.dirname, "src"),
    },
  },
});
