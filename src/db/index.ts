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

// Vercel serverless: cada función es un proceso aislado.
// Neon/poolers limitan conexiones por sesión (EMAXCONNSESSION).
// max=1 evita saturar el pooler cuando muchas funciones arrancan a la vez.
const isServerless = !!process.env.VERCEL;

const client = postgres(connectionString, {
  ssl: "require",
  max: isServerless ? 1 : 10,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false, // requerido para connection poolers (Neon, PgBouncer)
});

export const schema = { ...mainSchema, ...rgpdSchema };

export const db = drizzle(client, { schema });
