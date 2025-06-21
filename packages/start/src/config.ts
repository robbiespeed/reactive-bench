import {
  benchmarkConfigs as benchmarkConfigDefaults,
  testConfigs as testConfigDefaults,
  type FrameworkConfig,
} from "@reactive-bench/core/config.ts";

const fwPrefix = "@reactive-bench/start/frameworks";

export const frameworkConfigs: FrameworkConfig[] = [
  // {
  //   name: "js-raw",
  //   path: `${fwPrefix}/js-raw`,
  // },
  // {
  //   name: "metron-a",
  //   path: `${fwPrefix}/metron-a`,
  // },
  // {
  //   name: "metron-o",
  //   path: `${fwPrefix}/metron-o`,
  // },
  // {
  //   name: "metron-ob",
  //   path: `${fwPrefix}/metron-ob`,
  // },
  // {
  //   name: "metron-z",
  //   path: `${fwPrefix}/metron-z`,
  // },
  // {
  //   name: "metron-zz",
  //   path: `${fwPrefix}/metron-zz`,
  // },
  // {
  //   name: "metron-zzx",
  //   path: `${fwPrefix}/metron-zzx`,
  // },

  // Evaluate!:
  // {
  //   name: "metron-zzy",
  //   path: `${fwPrefix}/metron-zzy`,
  // },
  // {
  //   name: "metron-zzy (managed)",
  //   path: `${fwPrefix}/metron-zzy`,
  //   componentKey: "managed",
  // },
  // {
  //   name: "metron-zzyy",
  //   path: `${fwPrefix}/metron-zzyy`,
  // },
  // {
  //   name: "metron-zzyy (managed)",
  //   path: `${fwPrefix}/metron-zzyy`,
  //   componentKey: "managed",
  // },
  {
    name: "metron-zzyyx (managed)",
    path: `${fwPrefix}/metron-zzyyx`,
    componentKey: "managed",
  },
  {
    name: "metron-zzyyx (map managed)",
    path: `${fwPrefix}/metron-zzyyx`,
    componentKey: "mapManaged",
  },
  {
    name: "metron-zzyyxl (managed)",
    path: `${fwPrefix}/metron-zzyyxl`,
    componentKey: "managed",
  },
  {
    name: "metron-zzyyxl (sd managed)",
    path: `${fwPrefix}/metron-zzyyxl`,
    componentKey: "staticDerive",
  },
  {
    name: "metron-zzyyxl (map managed)",
    path: `${fwPrefix}/metron-zzyyxl`,
    componentKey: "mapManaged",
  },
  // {
  //   name: "metron-zzyx (managed)",
  //   path: `${fwPrefix}/metron-zzyx`,
  //   componentKey: "managed",
  // },
  // {
  //   name: "metron-zzyo",
  //   path: `${fwPrefix}/metron-zzyo`,
  // },
  // {
  //   name: "metron-zzyo (managed)",
  //   path: `${fwPrefix}/metron-zzyo`,
  //   componentKey: "managed",
  // },
  // {
  //   name: "alien-signals",
  //   path: `${fwPrefix}/alien-signals`,
  //   componentKey: "eager",
  // },
  // {
  //   name: "alien-signals (deferred)",
  //   path: `${fwPrefix}/alien-signals`,
  // },
  // {
  //   name: "metron",
  //   path: `${fwPrefix}/metron`,
  // },
  // {
  //   name: "mobx",
  //   path: `${fwPrefix}/mobx`,
  //   // mobx too slow on table benchmarks
  //   disabledBenchmarks: ["table.ts"],
  // },
];

export const benchmarkConfigs = [...benchmarkConfigDefaults];
export const testConfigs = [...testConfigDefaults];
