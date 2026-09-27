import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: "postgresql://postgres.tutzqhccxdvgnygtuolb:QjNpaqsFXC4R%26%2B5@aws-1-eu-west-1.pooler.supabase.com:6543/postgres"
  }
});
