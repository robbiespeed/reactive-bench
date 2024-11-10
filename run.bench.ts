import type { BenchmarkRunConfig } from "@reactive-bench/core/benchmark.ts";
import type { Component, Controller } from "@reactive-bench/core/component.ts";
import {
  benchmarkConfigs,
  frameworkConfigs,
} from "@reactive-bench/start/config.ts";
import { basename, join } from "node:path";
import { bench, describe } from "vitest";

for (const benchmarkConfig of benchmarkConfigs) {
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

      let controller: Controller;
      bench(
        frameworkConfig.name,
        () => {
          benchmark.run(controller, params);
        },
        {
          setup: () => {
            controller = benchmark.setup(component, params);
            benchmark.preRun?.(controller, params);
          },
          teardown: () => {
            controller.cleanup?.();
          },
        }
      );
    }
  });
}
