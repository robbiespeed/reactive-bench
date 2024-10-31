import type { Component } from "#lib/component";
import type { FrameworkConfig, TestConfig, TestSuiteItem } from "#lib/config";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

export interface TestRunner<TComponent extends Component<any>, TParams> {
  (component: TComponent, params: TParams): Promise<true | Error>;
}

export function createTestRunner<TComponent extends Component<any>, TParams>(
  run: (Component: TComponent, params: TParams) => undefined
): TestRunner<TComponent, TParams> {
  return async (Component, params) => {
    try {
      run(Component, params);
    } catch (cause) {
      return new Error("Test failure", { cause });
    }
    return true;
  };
}

function getWorkerPath() {
  const selfDirname = dirname(fileURLToPath(import.meta.url));
  return join(
    selfDirname,
    selfDirname.endsWith("src") ? "test-worker.ts" : "test-worker.js"
  );
}

async function runWorker(workerData: TestSuiteItem) {
  const workerPath = getWorkerPath();
  const worker = new Worker(workerPath, { workerData });

  const response: Error | true | undefined = await new Promise((resolve) => {
    worker.once("message", resolve);
  });

  await worker.terminate();

  return response;
}

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

export async function runTestSuite(
  frameworks: FrameworkConfig[],
  testConfigs: TestConfig[]
) {
  for (const fConfig of frameworks) {
    console.log(`Testing Framework: ${fConfig.name}`);
    for (const testConfig of testConfigs) {
      const benchmarkBasename = basename(testConfig.path);
      const frameworkPath = fConfig.path;
      const overrides = fConfig.componentOverrides?.[testConfig.path];
      const testName = testConfig.name;
      if (overrides === undefined) {
        const response = await runWorker({
          componentConfig: {
            path: join(frameworkPath, benchmarkBasename),
            key: "component",
          },
          testConfig,
        });
        logTestResponse(response, testName);
        continue;
      }

      if (overrides.length === 0) {
        console.log(`${testName}: SKIPPED`);
        continue;
      }

      let i = 1;
      for (const override of overrides) {
        const overridePath = override.path ?? benchmarkBasename;
        const overrideKey = override.key ?? "component";
        const response = await runWorker({
          componentConfig: {
            path: join(frameworkPath, overridePath),
            key: overrideKey,
          },
          testConfig,
        });
        logTestResponse(response, `${testName} (override: ${i})`);
        i++;
      }
    }
  }
}
