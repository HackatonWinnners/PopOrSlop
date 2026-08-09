import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Integration tests share one Postgres database — no parallel files.
    fileParallelism: false,
    env: {
      TEST: "1",
      TEST_DATABASE_URL:
        "postgres://postgres:VNXIlCJXWvVkcBaFI89DW0K5fzUkLsPeRfnANROxbmK3IbuZ7RQQIbo6Dy5sEOAJ@localhost:15432/poporslop_test",
      // Tests create fresh users; the 7-day cap is exercised explicitly, not ambiently.
      NEW_ACCOUNT_CAP_PTS: "1000000",
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
