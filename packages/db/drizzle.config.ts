import type { Config } from "drizzle-kit";

export default {
  schema: "./dist/schema/index.js",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env["DATABASE_URL"] ?? "postgres://arfos:arfos@localhost:5432/arfos",
  },
} satisfies Config;
