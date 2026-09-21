import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // DB unit tests require a real PostgreSQL connection.
    // Run integration tests with: pnpm test:integration
    passWithNoTests: true,
    include: ["src/**/__tests__/**/*.test.ts"],
  },
});
