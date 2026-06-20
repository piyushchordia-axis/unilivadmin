import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
const hasPgEnv = !!(process.env.PGHOST || process.env.PGDATABASE);

if (!connectionString && !hasPgEnv) {
  throw new Error(
    "Database config missing. Set DATABASE_URL, or the standard PG* vars " +
      "(PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE). PG* avoids URL-encoding " +
      "passwords that contain characters like / or #.",
  );
}

// With no connectionString, node-postgres reads the PG* env vars directly,
// which sidesteps URL-encoding pitfalls for special-character passwords.
export const pool = new Pool(connectionString ? { connectionString } : {});
export const db = drizzle(pool, { schema });

export * from "./schema";
