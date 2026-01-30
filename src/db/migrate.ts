import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pool from "./connection.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const migrationsDir = path.join(__dirname, "migrations");
    const files = fs.readdirSync(migrationsDir).sort();

    const { rows: applied } = await client.query(
      "SELECT name FROM _migrations"
    );
    const appliedSet = new Set(applied.map((r) => r.name));

    for (const file of files) {
      if (!file.endsWith(".sql") || appliedSet.has(file)) continue;

      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
      console.log(`Applying migration: ${file}`);

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO _migrations (name) VALUES ($1)", [
          file,
        ]);
        await client.query("COMMIT");
        console.log(`  ✓ ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`  ✗ ${file}:`, err);
        throw err;
      }
    }

    console.log("Migrations complete.");
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
