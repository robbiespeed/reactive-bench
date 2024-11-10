import type { FrameworkConfig, TestConfig } from "#lib/config";
import { runWorker } from "#lib/worker-utils";
import { basename, join } from "node:path";

function logTestResponse(response: Error | true | undefined, testName: string) {
  if (response === true) {
    console.log(`${testName}: PASS`);
  } else if (response) {
    console.error(`${testName}: FAIL`, response);
    console.log("\n");
  } else {
    console.log(`${testName}: MISSING`);
  }
}

export interface RunTestSuiteOptions {
  testFilter?: (name: string) => boolean;
  frameworkFilter?: (name: string) => boolean;
  verbose?: boolean;
}

export async function runTestSuite(
  frameworks: FrameworkConfig[],
  testConfigs: TestConfig[],
  { frameworkFilter, testFilter }: RunTestSuiteOptions = {}
) {
  for (const fConfig of frameworks) {
    if (frameworkFilter ? !frameworkFilter(fConfig.name) : false) {
      continue;
    }
    console.log(`Testing Framework: ${fConfig.name}`);
    for (const testConfig of testConfigs) {
      const testName = testConfig.name;
      if (testFilter ? !testFilter(testName) : false) {
        continue;
      }
      const benchmarkBasename = basename(testConfig.path);
      if (fConfig.disabledTests?.includes(benchmarkBasename)) {
        console.log(`${testName}: DISABLED`);
        continue;
      }
      const frameworkPath = fConfig.path;
      const response = await runWorker({
        componentConfig: {
          path: join(frameworkPath, benchmarkBasename),
          key: fConfig.componentKey ?? "component",
        },
        testConfig,
      });
      logTestResponse(response, testName);
    }
  }
}
