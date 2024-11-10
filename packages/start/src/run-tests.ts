import { createFilter } from "#lib/args";
import { frameworkConfigs, testConfigs } from "#lib/config";
import { runTestSuite } from "@reactive-bench/core/test.ts";
import { parseArgs } from "node:util";

const { tests, frameworks } = parseArgs({
  options: {
    frameworks: {
      type: "string",
      short: "f",
      default: "",
    },
    tests: {
      type: "string",
      short: "t",
      default: "",
    },
  },
}).values;

await runTestSuite(frameworkConfigs, testConfigs, {
  frameworkFilter: createFilter(frameworks),
  testFilter: createFilter(tests),
});
