import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests for auth stubs are covered by integration tests.
    // Integration tests require a running Clerk/PostgreSQL environment.
    passWithNoTests: true,
    include: ["src/**/__tests__/**/*.test.ts"],
  },
});
