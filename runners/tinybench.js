import { getGC } from "@reactive-bench/core/gc.ts";
import { readMemoryUsage } from "@reactive-bench/core/memory.ts";
import {
  benchmarkConfigs,
  frameworkConfigs,
} from "@reactive-bench/start/config.ts";
import { basename, join } from "node:path";
import { Bench } from "tinybench";

const garbageCollect = getGC();

for (const benchmarkConfig of benchmarkConfigs.filter(
  ({ name }) => name.includes("cellx") 
)) {
  const bench = new Bench({
    name: benchmarkConfig.name,
    iterations: 100,
    // tinybench doesn't include before/after hooks (GC) in this time so this needs to be reduced
    time: 0,
    warmupIterations: 500,
    warmupTime: 500,
  });
  const { params } = benchmarkConfig;
  const benchmarkModule = await import(benchmarkConfig.path);
  const benchmark = benchmarkModule[benchmarkConfig.key];
  const benchmarkBasename = basename(benchmarkConfig.path);

  let isDoneWarmup = false;
  const onStart = () => {
    isDoneWarmup = true;
  };
  bench.addEventListener("start", onStart);

  for (const frameworkConfig of frameworkConfigs) {
    const componentModule = await import(
      join(frameworkConfig.path, benchmarkBasename)
    ).catch(() => ({}));
    const component =
      componentModule[frameworkConfig.componentKey ?? "component"];

    if (component === undefined) {
      continue;
    }

    let controller;
    bench.add(
      frameworkConfig.name,
      () => {
        benchmark.run(controller, params);
      },
      {
        beforeAll() {
          return isDoneWarmup ? garbageCollect() : undefined;
        },
        beforeEach() {
          controller = benchmark.setup(component, params);
        },
        afterEach() {
          controller.cleanup?.();
          if (isDoneWarmup || readMemoryUsage() > 500_000) {
            return garbageCollect();
          }
        },
      }
    );
  }
  console.log(bench.name);
  await bench.run();
  console.table(bench.table());
  bench.removeEventListener("start", onStart);
  bench.reset();
}
