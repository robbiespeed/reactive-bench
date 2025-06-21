import type { FrameworkConfig, TestConfig, TestSuiteItem } from "#lib/config";
import { basename, join } from "node:path";
import type { Component } from "#lib/component";

function logTestResponse(
  response: Error | true | undefined,
  testName: string,
  isOptional = false
) {
  if (response === true) {
    console.log(`${testName}: PASS`);
  } else if (response) {
    if (isOptional) {
      console.log(`${testName}: FAIL (OPTIONAL)`);
    } else {
      console.error(`${testName}: FAIL`, response);
      console.log("\n");
    }
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
      const response = await runMain({
        componentConfig: {
          path: join(frameworkPath, benchmarkBasename),
          key: fConfig.componentKey ?? "component",
        },
        testConfig,
      });
      logTestResponse(response, testName, testConfig.optional);
    }
  }
}

async function runMain(item: TestSuiteItem) {
  const { componentConfig, testConfig } = item;

  const componentModule = await import(componentConfig.path).catch(() => ({}));
  const component: Component<unknown> | undefined =
    componentModule[componentConfig.key];

  if (component === undefined) {
    return undefined;
  }

  const testModule = await import(testConfig.path);
  const test = testModule[testConfig.key];
  try {
    await test(component, testConfig.params);
  } catch (cause) {
    return new Error("Test failure", { cause });
  }
  return true;
}
