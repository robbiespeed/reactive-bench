import { basename, dirname, join } from "node:path";
import { parentPort, workerData } from "node:worker_threads";
import type { Component } from "#lib/component";
import type { TestRunner } from "#lib/test";
import type { TestSuiteItem } from "#lib/config";

if (parentPort == null) {
  throw new Error("Expected to run as a worker");
}
if (workerData == null) {
  throw new Error("Expected worker data");
}

const port = parentPort;
const { componentConfig, testConfig }: TestSuiteItem = workerData;

async function main() {
  let componentPath = componentConfig.path;
  if (componentPath.charAt(0) === "#") {
    componentPath = join(
      dirname(componentPath),
      basename(componentPath, ".ts")
    );
  }

  const componentModule = await import(componentPath);
  const component: Component<any> = componentModule[componentConfig.key];

  // const component = (await import(componentPath).catch(() => ({})))[
  //   componentConfig.key
  // ] as Component<any> | undefined;

  if (component === undefined) {
    // console.log(componentConfig.path, componentConfig.key, "(NOT FOUND)");
    port.postMessage(undefined);
    return;
  }
  const testModule = await import(testConfig.path);
  const test: TestRunner<any, any> = testModule[testConfig.key];

  // const test = (await import(testConfig.path).catch(() => ({})))[
  //   testConfig.key
  // ] as TestRunner<any, any> | undefined;

  if (test === undefined) {
    port.postMessage(undefined);
    return;
  }

  try {
    port.postMessage(await test(component, testConfig.params));
  } catch (cause) {
    port.postMessage(new Error("Test failure", { cause }));
  }
}

await main();
