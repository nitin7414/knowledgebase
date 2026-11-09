import { readFileSync } from "fs";
import { join } from "path";
import prisma from "../lib/db";

async function main() {
  console.log("🚀 Initializing database schema and pgvector extension...");
  const sqlPath = join(process.cwd(), "prisma", "migrations", "0_init", "migration.sql");
  const sql = readFileSync(sqlPath, "utf-8");

  // Execute migration SQL commands
  await prisma.$executeRawUnsafe(sql);
  console.log("✅ Database schema, pgvector extension, HNSW index, and tsvector GIN index applied successfully!");
}

main()
  .catch((err) => {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

