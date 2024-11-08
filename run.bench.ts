import type { WorkerParams } from "#lib/worker";
import type {
  BenchmarkResult
} from "@reactive-bench/core/benchmark.ts";
import type { CellXParams } from "@reactive-bench/core/benchmarks/cellx.ts";
import type { DiamondParams } from "@reactive-bench/core/benchmarks/diamond.ts";
import type { OneToManyParams } from "@reactive-bench/core/benchmarks/one-to-many.ts";
import type { TableParams } from "@reactive-bench/core/benchmarks/table.ts";
import { basename, join } from "node:path";
import { bench, describe, BenchOptions } from 'vitest';

const benchOptions: BenchOptions = {
  time: 50,
};

const benchmarkConfigs: WorkerParams["benchmarkConfig"][] = [
  {
    path: "@reactive-bench/core/benchmarks/one-to-many.ts",
    key: "oneToMany",
    params: {
      xSize: 50,
      ySize: 50,
      minWrite: 1,
      maxWrite: 10,
    } satisfies OneToManyParams,
    runOptions: {
      fullCount: 10,
      taskCount: 20,
    },
  },
  {
    path: "@reactive-bench/core/benchmarks/cellx.ts",
    key: "cellxWriteRowByRow",
    params: {
      xSize: 10,
      ySize: 500,
      rowWriteCount: 5,
      minWrite: 1,
      maxWrite: 10,
    } satisfies CellXParams,
    runOptions: {
      fullCount: 10,
      taskCount: 20,
    },
  },
  {
    path: "@reactive-bench/core/benchmarks/cellx.ts",
    key: "cellxWriteAll",
    params: {
      xSize: 50,
      ySize: 50,
      rowWriteCount: 25,
      minWrite: 1,
      maxWrite: 10,
    } satisfies CellXParams,
    runOptions: {
      fullCount: 10,
      taskCount: 20,
    },
  },
  {
    path: "@reactive-bench/core/benchmarks/diamond.ts",
    key: "diamond",
    params: { size: 100, minWrite: 1, maxWrite: 10 } satisfies DiamondParams,
    runOptions: {
      fullCount: 10,
      taskCount: 20,
    },
  },
  {
    path: "@reactive-bench/core/benchmarks/table.ts",
    key: "tableRun",
    params: { appendSize: 10_000 } satisfies TableParams,
    runOptions: {
      fullCount: 10,
      taskCount: 20,
    },
  },
  {
    path: "@reactive-bench/core/benchmarks/table.ts",
    key: "tableReplace",
    params: { appendSize: 10_000 } satisfies TableParams,
    runOptions: {
      fullCount: 10,
      taskCount: 20,
    },
  },
  {
    path: "@reactive-bench/core/benchmarks/table.ts",
    key: "tableRemove",
    params: { appendSize: 10_000 } satisfies TableParams,
    runOptions: {
      fullCount: 10,
      taskCount: 20,
    },
  },
  {
    path: "@reactive-bench/core/benchmarks/table.ts",
    key: "tableSwap",
    params: { appendSize: 10_000 } satisfies TableParams,
    runOptions: {
      fullCount: 10,
      taskCount: 20,
    },
  },
];

interface FrameworkConfig {
  name: string;
  path: string;
  componentOverrides?: {
    [benchmarkPath: string]: { path?: string; key?: string }[];
  };
}

const frameworkConfigs: FrameworkConfig[] = [
  {
    name: "js-raw",
    path: "#lib/frameworks/js-raw",
  },
  {
    name: "alien-signals",
    path: "#lib/frameworks/alien-signals",
    // componentOverrides: {
    //   "@reactive-bench/core/benchmarks/cellx.ts": [
    //     {}, // default
    //     { key: "eager" },
    //   ],
    // },
  },
  {
    name: "mobx",
    path: "#lib/frameworks/mobx",
    componentOverrides: {
      // skip table because it's increadibly slow
      "@reactive-bench/core/benchmarks/table.ts": [],
    },
  },
];

const benchFilter = process.argv[2] || undefined;
const benchmarksGroup = new Map<string, Map<string, BenchmarkResult[]>>();

for (const benchmarkConfig of benchmarkConfigs) {
  if (benchFilter && !benchmarkConfig.key.includes(benchFilter)) {
    continue;
  }
  const benchmarkModule = await import(benchmarkConfig.path.replace('@reactive-bench/core/benchmarks', './packages/core/src/benchmarks'));
  const benchmark = benchmarkModule[benchmarkConfig.key];

  describe(benchmarkConfig.key, async () => {
    // console.log(`Bench: ${benchmarkConfig.path} > ${benchmarkConfig.key}`);
    const benchmarkBasename = basename(benchmarkConfig.path);

    const resultsGroup = new Map<string, BenchmarkResult[]>();
    benchmarksGroup.set(benchmarkConfig.key, resultsGroup);

    for (const frameworkConfig of frameworkConfigs) {
      const frameworkPath = frameworkConfig.path;
      const overrides =
        frameworkConfig.componentOverrides?.[benchmarkConfig.path];
      if (overrides === undefined) {
        // console.log(`Framework: ${frameworkPath}`);
        const componentPath = join(frameworkPath, benchmarkBasename).replace('#lib/', './packages/start/src/');
        const component = await import(componentPath);
        bench(frameworkConfig.name, () => {
          benchmark(
            component.component,
            benchmarkConfig.params,
            {
              fullCount: 2,
              taskCount: 1
            }
          );
        }, benchOptions);
        continue;
      }

      for (const override of overrides) {
        const overridePath = override.path ?? benchmarkBasename;
        const overrideKey = override.key ?? "component";

        // console.log(
        //   `Framework: ${frameworkPath} (${i}: ${overridePath} > ${overrideKey})`
        // );

        const componentPath = join(frameworkPath, overridePath).replace('#lib/', './packages/start/src/');
        const component = await import(componentPath);
        bench(frameworkConfig.name, () => {
          benchmark(
            component[overrideKey],
            benchmarkConfig.params,
            {
              fullCount: 2,
              taskCount: 1
            }
          );
        }, benchOptions);
      }
    }
  });
}
