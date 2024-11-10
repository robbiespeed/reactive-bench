import {
  benchmarkConfigs as benchmarkConfigDefaults,
  testConfigs as testConfigDefaults,
  type FrameworkConfig,
} from "@reactive-bench/core/config.ts";

const fwPrefix = "@reactive-bench/start/frameworks";

export const frameworkConfigs: FrameworkConfig[] = [
  {
    name: "js-raw",
    path: `${fwPrefix}/js-raw`,
  },
  {
    name: "alien-signals",
    path: `${fwPrefix}/alien-signals`,
  },
  {
    name: "alien-signals (eager)",
    path: `${fwPrefix}/alien-signals`,
    componentKey: "eager",
  },
  {
    name: "metron",
    path: `${fwPrefix}/metron`,
  },
  {
    name: "mobx",
    path: `${fwPrefix}/mobx`,
    // mobx too slow on table benchmarks
    disabledBenchmarks: ["table.ts"],
  },
];

export const benchmarkConfigs = [...benchmarkConfigDefaults];
export const testConfigs = [...testConfigDefaults];
