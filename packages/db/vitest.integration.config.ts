import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.integration.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Run integration tests serially to avoid connection pool contention
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
