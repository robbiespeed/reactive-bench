import type { BenchmarkRunConfig } from "@reactive-bench/core/benchmark.ts";
import type { Component, Controller } from "@reactive-bench/core/component.ts";
import { getGC } from "@reactive-bench/core/gc.ts";
import {
  benchmarkConfigs,
  frameworkConfigs,
} from "@reactive-bench/start/config.ts";
import { basename, join } from "node:path";
import { bench, describe } from "vitest";

const garbageCollect = getGC();

for (const benchmarkConfig of benchmarkConfigs.filter(
  ({ name }) => !name.includes("table")
)) {
  describe(benchmarkConfig.name, async () => {
    const { params } = benchmarkConfig;
    const benchmarkModule = await import(benchmarkConfig.path);
    const benchmark: BenchmarkRunConfig<
      Component<unknown>,
      unknown,
      Controller
    > = benchmarkModule[benchmarkConfig.key];
    const benchmarkBasename = basename(benchmarkConfig.path);

    for (const frameworkConfig of frameworkConfigs) {
      const componentModule = await import(
        join(frameworkConfig.path, benchmarkBasename)
      ).catch(() => ({}));
      const component: Component<unknown> | undefined =
        componentModule[frameworkConfig.componentKey ?? "component"];

      if (component === undefined) {
        bench.skip(frameworkConfig.name);
        continue;
      }

      // let controller: Controller | undefined;
      bench(
        frameworkConfig.name,
        async () => {
          // controller = benchmark.setup(component, params);
          let controller: Controller | undefined = benchmark.setup(
            component,
            params
          );
          benchmark.run(controller, params);
          controller.cleanup?.();
          // controller = undefined;
          // await garbageCollect();
        },
        {
          setup: async () => {
            // controller = benchmark.setup(component, params);
            await garbageCollect();
          },
          teardown: async () => {
            // controller!.cleanup?.();
            // controller = undefined;
            await garbageCollect();
          },
          // iterations: benchmarkConfig.runOptions?.iterations,
          // time: benchmarkConfig.runOptions?.time,
          // warmupIterations: benchmarkConfig.runOptions?.warmupIterations,
          // warmupTime: benchmarkConfig.runOptions?.warmupTime,
        }
      );
    }
  });
}
