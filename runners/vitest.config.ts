import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["./vitest.bench.ts"],
    pool: "forks",
    poolOptions: {
      forks: {
        execArgv: ["--expose-gc"],
      },
    },
  },
});
