// Applique les migrations Drizzle : `npm run db:migrate`
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { connect } from "./lib.mts";

const { pool } = connect();
await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
console.log("Migrations appliquées.");
await pool.end();
