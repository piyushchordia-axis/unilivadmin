import { defineConfig } from "drizzle-kit";
import path from "path";

const url = process.env.DATABASE_URL;

if (!url && !process.env.PGDATABASE) {
  throw new Error(
    "Set DATABASE_URL, or the PG* vars (PGHOST/PGUSER/PGPASSWORD/PGDATABASE), " +
      "before running drizzle-kit.",
  );
}

// Prefer DATABASE_URL; otherwise fall back to the standard PG* env vars so
// passwords with URL-special chars (/, #, …) work without encoding. A host that
// starts with "/" (e.g. /var/run/postgresql) connects over the Unix socket.
export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: url
    ? { url }
    : {
        host: process.env.PGHOST || "localhost",
        port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE as string,
        ssl: false,
      },
});
