import {
  benchmarkConfigs as benchmarkConfigDefaults,
  testConfigs as testConfigDefaults,
  type FrameworkConfig,
} from "@reactive-bench/core/config.ts";

const fwPrefix = "@reactive-bench/start/frameworks";

export const frameworkConfigs: FrameworkConfig[] = [
  {
    name: "js-raw",
    path: `${fwPrefix}//js-raw`,
  },
  {
    name: "alien-signals",
    path: `${fwPrefix}/alien-signals`,
    componentOverrides: {
      "@reactive-bench/core/benchmarks/cellx.ts": [
        { key: "eager" },
        {}, // default
      ],
      "@reactive-bench/core/benchmarks/diamond.ts": [
        { key: "eager" },
        {}, // default
      ],
      "@reactive-bench/core/benchmarks/one-to-many.ts": [
        { key: "eager" },
        {}, // default
      ],
      "@reactive-bench/core/benchmarks/table.ts": [
        { key: "eager" },
        {}, // default
      ],
      "@reactive-bench/core/tests/cellx.ts": [
        { key: "eager" },
        {}, // default
      ],
      "@reactive-bench/core/tests/diamond.ts": [
        { key: "eager" },
        {}, // default
      ],
      "@reactive-bench/core/tests/one-to-many.ts": [
        { key: "eager" },
        {}, // default
      ],
      "@reactive-bench/core/tests/table.ts": [
        { key: "eager" },
        {}, // default
      ],
    },
  },
  {
    name: "metron",
    path: `${fwPrefix}/metron`,
  },
  {
    name: "mobx",
    path: `${fwPrefix}/mobx`,
    componentOverrides: {
      // skip table because it's incredibly slow
      "@reactive-bench/core/benchmarks/table.ts": [],
    },
  },
];

export const benchmarkConfigs = [...benchmarkConfigDefaults];
export const testConfigs = [...testConfigDefaults];
