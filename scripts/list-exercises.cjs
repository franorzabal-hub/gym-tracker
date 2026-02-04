require("dotenv").config();
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const { rows } = await pool.query(`
    SELECT e.name, e.muscle_group, e.equipment, e.exercise_type
    FROM exercises e
    WHERE e.user_id IS NULL
    ORDER BY e.muscle_group, e.name
  `);

  console.log("=== LISTA COMPLETA DE EJERCICIOS GLOBALES ===\n");

  let currentMg = "";
  rows.forEach(r => {
    if (r.muscle_group !== currentMg) {
      currentMg = r.muscle_group;
      console.log("\n## " + (currentMg || "unknown").toUpperCase());
    }
    const equip = r.equipment ? " [" + r.equipment + "]" : "";
    console.log("  - " + r.name + equip);
  });

  await pool.end();
})();
