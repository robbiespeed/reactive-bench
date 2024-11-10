import { createFilter } from "#lib/args";
import { benchmarkConfigs, frameworkConfigs } from "#lib/config";
import { runBenchmarkSuite } from "@reactive-bench/core/benchmark.ts";
import { parseArgs } from "node:util";

const { verbose, benchmarks, frameworks } = parseArgs({
  options: {
    verbose: {
      type: "boolean",
      short: "v",
      default: false,
    },
    frameworks: {
      type: "string",
      short: "f",
      default: "",
    },
    benchmarks: {
      type: "string",
      short: "b",
      default: "",
    },
  },
}).values;

await runBenchmarkSuite(frameworkConfigs, benchmarkConfigs, {
  verbose,
  benchmarkFilter: createFilter(benchmarks),
  frameworkFilter: createFilter(frameworks),
});
