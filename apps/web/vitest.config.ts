import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Integration tests share one Postgres database — no parallel files.
    fileParallelism: false,
    env: {
      TEST: "1",
      TEST_DATABASE_URL: "postgres://poporslop:poporslop@localhost:5433/poporslop_test",
    },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "~": path.resolve(import.meta.dirname, "src"),
    },
  },
});
