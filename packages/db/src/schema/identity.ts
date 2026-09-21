import { pgTable, text, timestamp, unique, boolean } from "drizzle-orm/pg-core";

export const organisations = pgTable("organisations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: text("id").primaryKey(), // external auth subject (stub or Clerk)
  orgId: text("org_id")
    .notNull()
    .references(() => organisations.id),
  email: text("email").notNull(),
  displayName: text("display_name"),
  role: text("role").notNull().default("RESEARCHER"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    orgId: text("org_id")
      .notNull()
      .references(() => organisations.id),
    role: text("role").notNull().default("RESEARCHER"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    membershipsUserOrgUnique: unique("memberships_user_org_unique").on(t.userId, t.orgId),
  }),
);
