import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config();

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  schemaFilter: ["public"],
  dbCredentials: process.env.DATABASE_URL ? {
    url: process.env.DATABASE_URL,
  } : {
    host: process.env.SQL_HOST!,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME!,
    ssl: false,
  },
  verbose: true,
});
