import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./client";

async function main() {
  await migrate(db, { migrationsFolder: "src/server/db/migrations" });
  console.log("migrations applied");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
