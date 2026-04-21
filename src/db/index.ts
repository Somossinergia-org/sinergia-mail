import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as mainSchema from "./schema";
import * as rgpdSchema from "./schema-rgpd";

// DATABASE_URL es la variable principal (estándar Vercel/industria).
// CLOUDSQL_URL se acepta como fallback para compatibilidad con deploys existentes.
const connectionString = process.env.DATABASE_URL ?? process.env.CLOUDSQL_URL;
if (!connectionString) {
  throw new Error(
    "Missing database connection string. Set DATABASE_URL (or CLOUDSQL_URL as fallback) in your environment."
  );
}

const client = postgres(connectionString, {
  ssl: "require",
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const schema = { ...mainSchema, ...rgpdSchema };

export const db = drizzle(client, { schema });
