import { parentPort, workerData } from "node:worker_threads";
import type { Component } from "#lib/component";
import type { BenchmarkSuiteItem, TestSuiteItem } from "#lib/config";
import { runBenchmark } from "#lib/benchmark";

async function main() {
  if (parentPort == null) {
    throw new Error("Expected to run as a worker");
  }
  if (workerData == null) {
    throw new Error("Expected worker data");
  }

  const port = parentPort;
  const { componentConfig }: BenchmarkSuiteItem | TestSuiteItem = workerData;

  const componentModule = await import(componentConfig.path).catch(() => ({}));
  const component: Component<any> | undefined =
    componentModule[componentConfig.key];

  if (component === undefined) {
    port.postMessage(undefined);
    return;
  }

  if ("testConfig" in workerData) {
    const { testConfig } = workerData as TestSuiteItem;
    const testModule = await import(testConfig.path);
    const test = testModule[testConfig.key];

    try {
      await test(component, testConfig.params);
      port.postMessage(true);
    } catch (cause) {
      port.postMessage(new Error("Test failure", { cause }));
    }
  } else {
    const { benchmarkConfig } = workerData as BenchmarkSuiteItem;
    const benchmarkModule = await import(benchmarkConfig.path);
    const benchmark = benchmarkModule[benchmarkConfig.key];

    try {
      port.postMessage(
        await runBenchmark(
          benchmark,
          component,
          benchmarkConfig.params,
          benchmarkConfig.runOptions
        )
      );
    } catch (cause) {
      port.postMessage(new Error("Bench failure", { cause }));
    }
  }
}

await main();
