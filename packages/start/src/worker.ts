import type {
  BenchmarkRunner,
  BenchmarkRunOptions,
  BenchmarkRunResponse,
} from "@reactive-bench/core/benchmark.ts";
import type { Component } from "@reactive-bench/core/component.ts";
import { basename, dirname, join } from "node:path";
import { parentPort, workerData } from "node:worker_threads";

export interface WorkerParams {
  componentConfig: {
    path: string;
    key: string;
  };
  benchmarkConfig: {
    path: string;
    key: string;
    params: Record<string, unknown>;
    runOptions: BenchmarkRunOptions;
  };
}

if (parentPort == null) {
  throw new Error("Expected to run as a worker");
}
if (workerData == null) {
  throw new Error("Expected worker data");
}

const port = parentPort;
const { componentConfig, benchmarkConfig }: WorkerParams = workerData;

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
  const benchmarkModule = await import(benchmarkConfig.path);
  const benchmark: BenchmarkRunner<any, any> =
    benchmarkModule[benchmarkConfig.key];

  // const benchmark = (await import(benchmarkConfig.path).catch(() => ({})))[
  //   benchmarkConfig.key
  // ] as BenchmarkRunner<any, any> | undefined;

  if (benchmark === undefined) {
    port.postMessage(undefined);
    return;
  }

  try {
    port.postMessage(
      await benchmark(
        component,
        benchmarkConfig.params,
        benchmarkConfig.runOptions
      )
    );
  } catch (cause) {
    port.postMessage({
      results: [],
      failureReason: new Error("Bench failure", { cause }),
    } satisfies BenchmarkRunResponse);
  }
}

await main();
