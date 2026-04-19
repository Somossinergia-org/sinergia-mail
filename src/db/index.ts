import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as mainSchema from "./schema";
import * as rgpdSchema from "./schema-rgpd";

const connectionString = process.env.CLOUDSQL_URL!;

const client = postgres(connectionString, {
  ssl: "require",
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const schema = { ...mainSchema, ...rgpdSchema };

export const db = drizzle(client, { schema });
